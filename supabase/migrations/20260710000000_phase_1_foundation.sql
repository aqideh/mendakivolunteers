begin;

create schema if not exists core;
create schema if not exists audit;
create schema if not exists integration;

comment on schema core is 'Application identities and authorization data.';
comment on schema audit is 'Append-only administrative and security audit events.';
comment on schema integration is 'Private server-side integration state and staging data.';

revoke create on schema public from public;
revoke all on schema core from public;
revoke all on schema audit from public;
revoke all on schema integration from public;

grant usage on schema core to authenticated, service_role;
grant usage on schema audit to service_role;
grant usage on schema integration to service_role;

create type core.app_role as enum (
  'volunteer',
  'support_officer',
  'content_editor',
  'publisher',
  'attendance_manager',
  'gamification_manager',
  'auditor',
  'admin'
);

create type core.account_status as enum (
  'pending_link',
  'active',
  'suspended',
  'closed'
);

create type core.link_case_status as enum (
  'pending',
  'needs_review',
  'resolved',
  'closed'
);

create table core.user_accounts (
  id uuid primary key references auth.users (id) on delete cascade,
  status core.account_status not null default 'pending_link',
  display_name text check (
    display_name is null or char_length(display_name) between 1 and 120
  ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table core.user_accounts is
  'Application account metadata keyed by the Supabase Auth user ID.';

create table core.volunteers (
  id uuid primary key default gen_random_uuid(),
  ymhub_volunteer_id text not null unique check (
    char_length(ymhub_volunteer_id) between 1 and 128
  ),
  auth_user_id uuid unique references core.user_accounts (id) on delete set null,
  ymhub_status text check (
    ymhub_status is null or char_length(ymhub_status) between 1 and 100
  ),
  source_updated_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteers_source_time_order check (
    source_updated_at is null
    or last_synced_at is null
    or last_synced_at >= source_updated_at
  )
);

comment on table core.volunteers is
  'App projection of the authoritative YM Hub volunteer identity. App-owned tables use id as their foreign key.';
comment on column core.volunteers.ymhub_volunteer_id is
  'Placeholder-backed authoritative external ID. Replace field mapping in the YM Hub adapter, not throughout application code.';

create index volunteers_auth_user_id_idx
  on core.volunteers (auth_user_id)
  where auth_user_id is not null;

create table core.user_roles (
  user_id uuid not null references core.user_accounts (id) on delete cascade,
  role core.app_role not null,
  granted_by uuid references core.user_accounts (id) on delete set null,
  granted_at timestamptz not null default now(),
  reason text check (reason is null or char_length(reason) <= 500),
  primary key (user_id, role)
);

comment on table core.user_roles is
  'Database-enforced application roles. Direct browser writes are prohibited.';

create index user_roles_role_idx on core.user_roles (role, user_id);

create table core.account_link_cases (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null references core.user_accounts (id) on delete cascade,
  candidate_ymhub_volunteer_id text check (
    candidate_ymhub_volunteer_id is null
    or char_length(candidate_ymhub_volunteer_id) between 1 and 128
  ),
  status core.link_case_status not null default 'pending',
  reason_code text check (reason_code is null or char_length(reason_code) <= 100),
  resolution_notes text check (
    resolution_notes is null or char_length(resolution_notes) <= 2000
  ),
  resolved_by uuid references core.user_accounts (id) on delete set null,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint account_link_resolution_consistent check (
    (status in ('resolved', 'closed') and resolved_at is not null)
    or (status in ('pending', 'needs_review') and resolved_at is null)
  )
);

create unique index account_link_cases_one_open_per_user_idx
  on core.account_link_cases (auth_user_id)
  where status in ('pending', 'needs_review');

create table audit.events (
  id bigint generated always as identity primary key,
  actor_user_id uuid,
  action text not null check (char_length(action) between 3 and 120),
  target_type text check (
    target_type is null or char_length(target_type) between 1 and 100
  ),
  target_id text check (
    target_id is null or char_length(target_id) between 1 and 200
  ),
  request_id uuid,
  metadata jsonb not null default '{}'::jsonb check (
    jsonb_typeof(metadata) = 'object'
  ),
  occurred_at timestamptz not null default now()
);

comment on table audit.events is
  'Append-only application audit stream. No browser role can access this table.';

create index audit_events_actor_time_idx
  on audit.events (actor_user_id, occurred_at desc);
create index audit_events_target_time_idx
  on audit.events (target_type, target_id, occurred_at desc);
create index audit_events_action_time_idx
  on audit.events (action, occurred_at desc);

create or replace function core.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function core.has_role(required_role core.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_roles
    where user_id = auth.uid()
      and role = required_role
  );
$$;

create or replace function core.can_support_volunteers()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_roles
    where user_id = auth.uid()
      and role in ('support_officer', 'auditor', 'admin')
  );
$$;

create or replace function audit.write_event(
  event_action text,
  event_target_type text default null,
  event_target_id text default null,
  event_metadata jsonb default '{}'::jsonb,
  event_actor_user_id uuid default auth.uid(),
  event_request_id uuid default null
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, audit
as $$
declare
  inserted_id bigint;
begin
  insert into audit.events (
    actor_user_id,
    action,
    target_type,
    target_id,
    request_id,
    metadata
  )
  values (
    event_actor_user_id,
    event_action,
    event_target_type,
    event_target_id,
    event_request_id,
    coalesce(event_metadata, '{}'::jsonb)
  )
  returning id into inserted_id;

  return inserted_id;
end;
$$;

create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  insert into core.user_accounts (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into core.user_roles (user_id, role, reason)
  values (new.id, 'volunteer', 'Default role assigned at account creation')
  on conflict (user_id, role) do nothing;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object('default_role', 'volunteer'),
    new.id,
    null
  );

  return new;
end;
$$;

create or replace function audit.capture_account_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  if tg_op = 'UPDATE' and old.status is distinct from new.status then
    perform audit.write_event(
      'account.status_changed',
      'user_account',
      new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

create or replace function audit.capture_volunteer_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.write_event(
      'volunteer.created',
      'volunteer',
      new.id::text,
      jsonb_build_object(
        'linked', new.auth_user_id is not null,
        'source_status', new.ymhub_status
      )
    );
    return new;
  end if;

  if old.auth_user_id is distinct from new.auth_user_id then
    perform audit.write_event(
      'volunteer.identity_link_changed',
      'volunteer',
      new.id::text,
      jsonb_build_object(
        'previous_auth_user_id', old.auth_user_id,
        'new_auth_user_id', new.auth_user_id
      )
    );
  end if;

  if old.ymhub_status is distinct from new.ymhub_status then
    perform audit.write_event(
      'volunteer.source_status_changed',
      'volunteer',
      new.id::text,
      jsonb_build_object('from', old.ymhub_status, 'to', new.ymhub_status)
    );
  end if;

  return new;
end;
$$;

create or replace function audit.capture_role_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.write_event(
      'role.granted',
      'user_account',
      new.user_id::text,
      jsonb_build_object('role', new.role, 'reason', new.reason)
    );
    return new;
  end if;

  perform audit.write_event(
    'role.revoked',
    'user_account',
    old.user_id::text,
    jsonb_build_object('role', old.role)
  );
  return old;
end;
$$;

create or replace function audit.capture_link_case_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.write_event(
      'account_link_case.created',
      'account_link_case',
      new.id::text,
      jsonb_build_object('status', new.status, 'reason_code', new.reason_code)
    );
    return new;
  end if;

  if old.status is distinct from new.status then
    perform audit.write_event(
      'account_link_case.status_changed',
      'account_link_case',
      new.id::text,
      jsonb_build_object('from', old.status, 'to', new.status)
    );
  end if;

  return new;
end;
$$;

create trigger user_accounts_set_updated_at
before update on core.user_accounts
for each row execute function core.set_updated_at();

create trigger volunteers_set_updated_at
before update on core.volunteers
for each row execute function core.set_updated_at();

create trigger account_link_cases_set_updated_at
before update on core.account_link_cases
for each row execute function core.set_updated_at();

create trigger user_accounts_audit
before update on core.user_accounts
for each row execute function audit.capture_account_change();

create trigger volunteers_audit
before insert or update on core.volunteers
for each row execute function audit.capture_volunteer_change();

create trigger user_roles_audit
before insert or delete on core.user_roles
for each row execute function audit.capture_role_change();

create trigger account_link_cases_audit
before insert or update on core.account_link_cases
for each row execute function audit.capture_link_case_change();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function core.handle_new_auth_user();

insert into core.user_accounts (id, display_name)
select
  id,
  nullif(trim(coalesce(raw_user_meta_data ->> 'full_name', '')), '')
from auth.users
on conflict (id) do nothing;

insert into core.user_roles (user_id, role, reason)
select id, 'volunteer', 'Backfilled default role during Phase 1 migration'
from auth.users
on conflict (user_id, role) do nothing;

alter table core.user_accounts enable row level security;
alter table core.user_accounts force row level security;
alter table core.volunteers enable row level security;
alter table core.volunteers force row level security;
alter table core.user_roles enable row level security;
alter table core.user_roles force row level security;
alter table core.account_link_cases enable row level security;
alter table core.account_link_cases force row level security;
alter table audit.events enable row level security;
alter table audit.events force row level security;

create policy user_accounts_select_self
on core.user_accounts
for select
to authenticated
using (id = auth.uid());

create policy user_accounts_select_support
on core.user_accounts
for select
to authenticated
using (core.can_support_volunteers());

create policy volunteers_select_self
on core.volunteers
for select
to authenticated
using (auth_user_id = auth.uid());

create policy volunteers_select_support
on core.volunteers
for select
to authenticated
using (core.can_support_volunteers());

create policy user_roles_select_self
on core.user_roles
for select
to authenticated
using (user_id = auth.uid());

create policy user_roles_select_audit_or_admin
on core.user_roles
for select
to authenticated
using (
  core.has_role('auditor'::core.app_role)
  or core.has_role('admin'::core.app_role)
);

create policy account_link_cases_select_self
on core.account_link_cases
for select
to authenticated
using (auth_user_id = auth.uid());

create policy account_link_cases_select_support
on core.account_link_cases
for select
to authenticated
using (core.can_support_volunteers());

revoke all on all tables in schema core from anon, authenticated;
revoke all on all sequences in schema core from anon, authenticated;
revoke all on all functions in schema core from public, anon, authenticated;
revoke all on all tables in schema audit from anon, authenticated;
revoke all on all sequences in schema audit from anon, authenticated;
revoke all on all functions in schema audit from public, anon, authenticated;
revoke all on all tables in schema integration from anon, authenticated;
revoke all on all sequences in schema integration from anon, authenticated;
revoke all on all functions in schema integration from public, anon, authenticated;

grant select on core.user_accounts to authenticated;
grant select on core.volunteers to authenticated;
grant select on core.user_roles to authenticated;
grant select on core.account_link_cases to authenticated;
grant execute on function core.has_role(core.app_role) to authenticated;
grant execute on function core.can_support_volunteers() to authenticated;

grant all on all tables in schema core to service_role;
grant all on all sequences in schema core to service_role;
grant execute on all functions in schema core to service_role;
grant select, insert on audit.events to service_role;
grant usage, select on all sequences in schema audit to service_role;
grant execute on function audit.write_event(text, text, text, jsonb, uuid, uuid)
  to service_role;
grant all on all tables in schema integration to service_role;
grant all on all sequences in schema integration to service_role;
grant execute on all functions in schema integration to service_role;

alter default privileges in schema core revoke all on tables from anon, authenticated;
alter default privileges in schema core revoke all on sequences from anon, authenticated;
alter default privileges in schema core revoke execute on functions from public, anon, authenticated;
alter default privileges in schema audit revoke all on tables from anon, authenticated;
alter default privileges in schema audit revoke all on sequences from anon, authenticated;
alter default privileges in schema audit revoke execute on functions from public, anon, authenticated;
alter default privileges in schema integration revoke all on tables from anon, authenticated;
alter default privileges in schema integration revoke all on sequences from anon, authenticated;
alter default privileges in schema integration revoke execute on functions from public, anon, authenticated;

commit;
