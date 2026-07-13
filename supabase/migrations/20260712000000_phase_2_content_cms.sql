begin;

create schema if not exists content;
create schema if not exists app_private;

comment on schema content is
  'App-owned opportunity and news content exposed through a tightly controlled Data API surface.';
comment on schema app_private is
  'Private authorization and trigger helpers. This schema must never be exposed through the Data API.';

revoke all on schema content from public;
revoke all on schema app_private from public;
grant usage on schema content to anon, authenticated, service_role;
grant usage on schema app_private to anon, authenticated, service_role;

create type content.content_status as enum (
  'draft',
  'in_review',
  'scheduled',
  'published',
  'archived'
);

create type content.content_kind as enum (
  'opportunity',
  'news'
);

create table content.opportunities (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    char_length(slug) between 3 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  title text not null check (char_length(title) between 5 and 140),
  summary text not null check (char_length(summary) between 10 and 400),
  body text not null check (char_length(body) between 20 and 20000),
  category text not null check (char_length(category) between 2 and 80),
  location_name text check (
    location_name is null or char_length(location_name) between 2 and 180
  ),
  is_remote boolean not null default false,
  starts_at timestamptz not null,
  ends_at timestamptz,
  registration_deadline timestamptz,
  registration_url text not null check (
    char_length(registration_url) <= 2048
    and registration_url ~* '^https://[^[:space:]]+$'
  ),
  ymhub_activity_id text check (
    ymhub_activity_id is null or char_length(ymhub_activity_id) between 1 and 128
  ),
  featured boolean not null default false,
  status content.content_status not null default 'draft',
  publish_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references core.user_accounts (id) on delete set null,
  updated_by uuid references core.user_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint opportunities_time_order check (
    ends_at is null or ends_at >= starts_at
  ),
  constraint opportunities_registration_deadline check (
    registration_deadline is null or registration_deadline <= starts_at
  ),
  constraint opportunities_schedule_requires_time check (
    status <> 'scheduled' or publish_at is not null
  ),
  constraint opportunities_published_requires_time check (
    status <> 'published' or published_at is not null
  ),
  constraint opportunities_expiry_order check (
    expires_at is null
    or expires_at > coalesce(published_at, publish_at, created_at)
  )
);

comment on table content.opportunities is
  'App-owned discovery listings. Registration remains a YM Hub link-out.';
comment on column content.opportunities.ymhub_activity_id is
  'Optional placeholder-backed YM Hub activity identifier used only for later reconciliation.';

create table content.news_posts (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    char_length(slug) between 3 and 160
    and slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'
  ),
  title text not null check (char_length(title) between 5 and 140),
  summary text not null check (char_length(summary) between 10 and 400),
  body text not null check (char_length(body) between 20 and 20000),
  featured boolean not null default false,
  status content.content_status not null default 'draft',
  publish_at timestamptz,
  published_at timestamptz,
  expires_at timestamptz,
  created_by uuid references core.user_accounts (id) on delete set null,
  updated_by uuid references core.user_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint news_schedule_requires_time check (
    status <> 'scheduled' or publish_at is not null
  ),
  constraint news_published_requires_time check (
    status <> 'published' or published_at is not null
  ),
  constraint news_expiry_order check (
    expires_at is null
    or expires_at > coalesce(published_at, publish_at, created_at)
  )
);

comment on table content.news_posts is
  'App-owned volunteer news and announcements.';

create table content.revisions (
  id bigint generated always as identity primary key,
  content_kind content.content_kind not null,
  content_id uuid not null,
  revision_number integer not null check (revision_number > 0),
  operation text not null check (operation in ('insert', 'update')),
  status content.content_status not null,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  actor_user_id uuid references core.user_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (content_kind, content_id, revision_number)
);

comment on table content.revisions is
  'Append-only snapshots created by database triggers for CMS auditability and later rollback tooling.';

create index opportunities_public_listing_idx
  on content.opportunities (featured desc, starts_at, id)
  where status in ('published', 'scheduled');
create index opportunities_status_publish_idx
  on content.opportunities (status, publish_at, expires_at);
create index opportunities_created_by_idx
  on content.opportunities (created_by)
  where created_by is not null;
create index opportunities_updated_by_idx
  on content.opportunities (updated_by)
  where updated_by is not null;

create index news_public_listing_idx
  on content.news_posts (featured desc, publish_at desc, id)
  where status in ('published', 'scheduled');
create index news_status_publish_idx
  on content.news_posts (status, publish_at, expires_at);
create index news_created_by_idx
  on content.news_posts (created_by)
  where created_by is not null;
create index news_updated_by_idx
  on content.news_posts (updated_by)
  where updated_by is not null;

create index content_revisions_lookup_idx
  on content.revisions (content_kind, content_id, revision_number desc);
create index content_revisions_actor_idx
  on content.revisions (actor_user_id, created_at desc)
  where actor_user_id is not null;

create or replace function app_private.can_manage_content()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from core.user_roles as roles
      join core.user_accounts as accounts
        on accounts.id = roles.user_id
      where roles.user_id = (select auth.uid())
        and roles.role in ('content_editor', 'publisher', 'admin')
        and accounts.status = 'active'
    );
$$;

create or replace function app_private.can_publish_content()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select (select auth.uid()) is not null
    and exists (
      select 1
      from core.user_roles as roles
      join core.user_accounts as accounts
        on accounts.id = roles.user_id
      where roles.user_id = (select auth.uid())
        and roles.role in ('publisher', 'admin')
        and accounts.status = 'active'
    );
$$;

create or replace function app_private.prepare_content_row()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, auth
as $$
begin
  if tg_op = 'INSERT' then
    if new.created_by is null then
      new.created_by := auth.uid();
    end if;

    if new.updated_by is null then
      new.updated_by := coalesce(auth.uid(), new.created_by);
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;

    if auth.uid() is not null then
      new.updated_by := auth.uid();
    end if;
  end if;

  if new.status = 'scheduled' and new.publish_at is null then
    raise exception 'Scheduled content requires a publication time'
      using errcode = '23514';
  end if;

  if new.status = 'published' then
    new.published_at := coalesce(new.published_at, now());
    new.publish_at := coalesce(new.publish_at, new.published_at);
  elsif new.status in ('draft', 'in_review', 'scheduled') then
    new.published_at := null;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

create or replace function app_private.capture_content_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, content, audit, auth
as $$
declare
  record_kind content.content_kind;
  next_revision integer;
begin
  record_kind := case tg_table_name
    when 'opportunities' then 'opportunity'::content.content_kind
    when 'news_posts' then 'news'::content.content_kind
    else null
  end;

  if record_kind is null then
    raise exception 'Unsupported content table: %', tg_table_name;
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(record_kind::text || ':' || new.id::text, 0)
  );

  select coalesce(max(revision_number), 0) + 1
  into next_revision
  from content.revisions
  where content_kind = record_kind
    and content_id = new.id;

  insert into content.revisions (
    content_kind,
    content_id,
    revision_number,
    operation,
    status,
    snapshot,
    actor_user_id
  )
  values (
    record_kind,
    new.id,
    next_revision,
    lower(tg_op),
    new.status,
    to_jsonb(new),
    auth.uid()
  );

  if tg_op = 'INSERT' then
    perform audit.write_event(
      'content.created',
      record_kind::text,
      new.id::text,
      jsonb_build_object('status', new.status, 'revision', next_revision)
    );
  elsif old.status is distinct from new.status then
    perform audit.write_event(
      'content.status_changed',
      record_kind::text,
      new.id::text,
      jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'revision', next_revision
      )
    );
  end if;

  return new;
end;
$$;

create trigger opportunities_prepare_write
before insert or update on content.opportunities
for each row execute function app_private.prepare_content_row();

create trigger news_posts_prepare_write
before insert or update on content.news_posts
for each row execute function app_private.prepare_content_row();

create trigger opportunities_capture_revision
after insert or update on content.opportunities
for each row execute function app_private.capture_content_revision();

create trigger news_posts_capture_revision
after insert or update on content.news_posts
for each row execute function app_private.capture_content_revision();

alter table content.opportunities enable row level security;
alter table content.opportunities force row level security;
alter table content.news_posts enable row level security;
alter table content.news_posts force row level security;
alter table content.revisions enable row level security;
alter table content.revisions force row level security;

create policy opportunities_select_published
on content.opportunities
for select
to anon, authenticated
using (
  (
    status = 'published'
    or (status = 'scheduled' and publish_at <= now())
  )
  and coalesce(published_at, publish_at, created_at) <= now()
  and (expires_at is null or expires_at > now())
);

create policy opportunities_select_managers
on content.opportunities
for select
to authenticated
using ((select app_private.can_manage_content()));

create policy opportunities_insert_managers
on content.opportunities
for insert
to authenticated
with check (
  (select app_private.can_manage_content())
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    status in ('draft', 'in_review')
    or (select app_private.can_publish_content())
  )
);

create policy opportunities_update_managers
on content.opportunities
for update
to authenticated
using ((select app_private.can_manage_content()))
with check (
  updated_by = (select auth.uid())
  and (
    status in ('draft', 'in_review')
    or (select app_private.can_publish_content())
  )
);

create policy news_posts_select_published
on content.news_posts
for select
to anon, authenticated
using (
  (
    status = 'published'
    or (status = 'scheduled' and publish_at <= now())
  )
  and coalesce(published_at, publish_at, created_at) <= now()
  and (expires_at is null or expires_at > now())
);

create policy news_posts_select_managers
on content.news_posts
for select
to authenticated
using ((select app_private.can_manage_content()));

create policy news_posts_insert_managers
on content.news_posts
for insert
to authenticated
with check (
  (select app_private.can_manage_content())
  and created_by = (select auth.uid())
  and updated_by = (select auth.uid())
  and (
    status in ('draft', 'in_review')
    or (select app_private.can_publish_content())
  )
);

create policy news_posts_update_managers
on content.news_posts
for update
to authenticated
using ((select app_private.can_manage_content()))
with check (
  updated_by = (select auth.uid())
  and (
    status in ('draft', 'in_review')
    or (select app_private.can_publish_content())
  )
);

create policy content_revisions_select_managers
on content.revisions
for select
to authenticated
using ((select app_private.can_manage_content()));

revoke all on all tables in schema content from anon, authenticated;
revoke all on all sequences in schema content from anon, authenticated;
revoke all on all functions in schema content from public, anon, authenticated;
revoke all on all functions in schema app_private from public, anon, authenticated;

 grant select on content.opportunities to anon;
 grant select on content.news_posts to anon;
 grant select, insert, update on content.opportunities to authenticated;
 grant select, insert, update on content.news_posts to authenticated;
 grant select on content.revisions to authenticated;

 grant execute on function app_private.can_manage_content()
   to authenticated, service_role;
 grant execute on function app_private.can_publish_content()
   to authenticated, service_role;

 grant all on all tables in schema content to service_role;
 grant all on all sequences in schema content to service_role;
 grant execute on all functions in schema content to service_role;
 grant execute on all functions in schema app_private to service_role;

alter default privileges in schema content
  revoke all on tables from anon, authenticated;
alter default privileges in schema content
  revoke all on sequences from anon, authenticated;
alter default privileges in schema content
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema app_private
  revoke execute on functions from public, anon, authenticated;

commit;
