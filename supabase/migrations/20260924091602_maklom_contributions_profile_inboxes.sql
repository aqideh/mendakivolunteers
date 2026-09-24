
create table if not exists public.volunteer_contributions (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete restrict,
  event_id uuid not null references public.phaseone_events(id) on delete restrict,
  attendance_session_id uuid not null unique references public.phaseone_attendance_sessions(id) on delete restrict,
  occurred_at timestamptz not null,
  operational_minutes integer not null check (operational_minutes >= 0),
  approved_minutes integer check (approved_minutes is null or approved_minutes >= 0),
  status text not null default 'pending' check (status in ('pending','approved','rejected','needs_review')),
  approval_note text,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_contributions_approval_consistency check (
    (status = 'approved' and approved_minutes is not null and approved_at is not null)
    or status <> 'approved'
  )
);

create index if not exists volunteer_contributions_volunteer_idx
  on public.volunteer_contributions(volunteer_id, occurred_at desc);
create index if not exists volunteer_contributions_status_idx
  on public.volunteer_contributions(status, occurred_at desc);
create index if not exists volunteer_contributions_event_idx
  on public.volunteer_contributions(event_id);

create table if not exists public.volunteer_contribution_audit (
  id bigint generated always as identity primary key,
  contribution_id uuid not null references public.volunteer_contributions(id) on delete cascade,
  old_status text,
  new_status text not null,
  old_approved_minutes integer,
  new_approved_minutes integer,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now()
);

create or replace function public.set_volunteer_contribution_review_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();

  if new.status = 'approved'
     and (
       tg_op = 'INSERT'
       or old.status is distinct from 'approved'
       or old.approved_minutes is distinct from new.approved_minutes
     ) then
    new.approved_at := now();
    new.approved_by := auth.uid();
  elsif new.status <> 'approved' and tg_op = 'UPDATE' and old.status = 'approved' then
    new.approved_at := null;
    new.approved_by := null;
  end if;

  return new;
end;
$$;

drop trigger if exists volunteer_contributions_set_review_fields on public.volunteer_contributions;
create trigger volunteer_contributions_set_review_fields
before insert or update on public.volunteer_contributions
for each row execute function public.set_volunteer_contribution_review_fields();

create or replace function public.audit_volunteer_contribution()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.approved_minutes is distinct from new.approved_minutes then
    insert into public.volunteer_contribution_audit (
      contribution_id,
      old_status,
      new_status,
      old_approved_minutes,
      new_approved_minutes,
      changed_by
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      case when tg_op = 'INSERT' then null else old.approved_minutes end,
      new.approved_minutes,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

drop trigger if exists volunteer_contributions_audit on public.volunteer_contributions;
create trigger volunteer_contributions_audit
after insert or update on public.volunteer_contributions
for each row execute function public.audit_volunteer_contribution();

create or replace function core.capture_maklom_contribution_from_session()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  canonical_volunteer_id uuid;
  duration_minutes integer;
begin
  if new.checked_out_at is null or new.checked_in_at is null then
    return new;
  end if;

  select roster.volunteer_id
  into canonical_volunteer_id
  from public.phaseone_roster roster
  where roster.id = new.origin_roster_id;

  if canonical_volunteer_id is null then
    return new;
  end if;

  duration_minutes := greatest(
    floor(extract(epoch from (new.checked_out_at - new.checked_in_at)) / 60)::integer,
    0
  );

  insert into public.volunteer_contributions (
    volunteer_id,
    event_id,
    attendance_session_id,
    occurred_at,
    operational_minutes,
    status
  ) values (
    canonical_volunteer_id,
    new.event_id,
    new.id,
    new.checked_out_at,
    duration_minutes,
    'pending'
  )
  on conflict (attendance_session_id) do update
  set
    volunteer_id = excluded.volunteer_id,
    event_id = excluded.event_id,
    occurred_at = excluded.occurred_at,
    status = case
      when public.volunteer_contributions.status = 'approved'
        and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
        then 'needs_review'
      when public.volunteer_contributions.status = 'rejected'
        then 'pending'
      else public.volunteer_contributions.status
    end,
    approved_at = case
      when public.volunteer_contributions.status = 'approved'
        and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
        then null
      else public.volunteer_contributions.approved_at
    end,
    approved_by = case
      when public.volunteer_contributions.status = 'approved'
        and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
        then null
      else public.volunteer_contributions.approved_by
    end,
    operational_minutes = excluded.operational_minutes,
    updated_at = now();

  return new;
end;
$$;

revoke all on function core.capture_maklom_contribution_from_session() from public, anon, authenticated;

drop trigger if exists attendance_sessions_capture_maklom_contribution
  on public.phaseone_attendance_sessions;
create trigger attendance_sessions_capture_maklom_contribution
after insert or update of checked_in_at, checked_out_at, origin_roster_id
on public.phaseone_attendance_sessions
for each row execute function core.capture_maklom_contribution_from_session();

insert into public.volunteer_contributions (
  volunteer_id,
  event_id,
  attendance_session_id,
  occurred_at,
  operational_minutes,
  status
)
select
  roster.volunteer_id,
  sessions.event_id,
  sessions.id,
  sessions.checked_out_at,
  greatest(
    floor(extract(epoch from (sessions.checked_out_at - sessions.checked_in_at)) / 60)::integer,
    0
  ),
  'pending'
from public.phaseone_attendance_sessions sessions
join public.phaseone_roster roster
  on roster.id = sessions.origin_roster_id
where sessions.checked_in_at is not null
  and sessions.checked_out_at is not null
  and roster.volunteer_id is not null
on conflict (attendance_session_id) do nothing;

alter table public.volunteer_contributions enable row level security;
alter table public.volunteer_contribution_audit enable row level security;

create policy volunteer_contributions_read_members
on public.volunteer_contributions for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));
create policy volunteer_contributions_update_editors
on public.volunteer_contributions for update to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
))
with check (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
));
create policy volunteer_contribution_audit_read_members
on public.volunteer_contribution_audit for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));

grant select, update on public.volunteer_contributions to authenticated;
grant select on public.volunteer_contribution_audit to authenticated;
grant select, insert, update, delete on public.volunteer_contributions to service_role;
grant select, insert on public.volunteer_contribution_audit to service_role;
grant usage, select on sequence public.volunteer_contribution_audit_id_seq to service_role;

create table if not exists public.volunteer_profile_change_inbox (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete cascade,
  field_name text not null check (field_name in ('mobile')),
  old_value text,
  new_value text,
  source text not null default 'keluarga_self_service' check (source = 'keluarga_self_service'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','superseded')),
  source_changed_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text
);

create index if not exists volunteer_profile_change_inbox_pending_idx
  on public.volunteer_profile_change_inbox(status, source_changed_at desc);

alter table public.volunteer_profile_change_inbox enable row level security;

create policy volunteer_profile_change_inbox_read_members
on public.volunteer_profile_change_inbox for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));
create policy volunteer_profile_change_inbox_update_editors
on public.volunteer_profile_change_inbox for update to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
))
with check (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
));

grant select, update on public.volunteer_profile_change_inbox to authenticated;
grant select, insert, update on public.volunteer_profile_change_inbox to service_role;

create or replace function core.enqueue_maklom_mobile_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
begin
  if old.mobile is not distinct from new.mobile then
    return new;
  end if;

  if not exists (
    select 1 from public.volunteers
    where core_volunteer_id = new.id
  ) then
    return new;
  end if;

  update public.volunteer_profile_change_inbox
  set status = 'superseded'
  where volunteer_id = new.id
    and field_name = 'mobile'
    and status = 'pending';

  insert into public.volunteer_profile_change_inbox (
    volunteer_id,
    field_name,
    old_value,
    new_value,
    source_changed_at
  ) values (
    new.id,
    'mobile',
    old.mobile,
    new.mobile,
    now()
  );

  return new;
end;
$$;

revoke all on function core.enqueue_maklom_mobile_change() from public, anon, authenticated;

drop trigger if exists volunteers_enqueue_maklom_mobile_change on core.volunteers;
create trigger volunteers_enqueue_maklom_mobile_change
after update of mobile on core.volunteers
for each row execute function core.enqueue_maklom_mobile_change();

create table if not exists public.maklom_profile_inbox (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid references core.volunteers(id) on delete set null,
  source_kind text not null check (source_kind in ('insight','review')),
  source_record_id uuid not null,
  event_id uuid not null references public.phaseone_events(id) on delete restrict,
  source_person_key text,
  title text not null,
  payload jsonb not null default '{}'::jsonb check (jsonb_typeof(payload) = 'object'),
  status text not null default 'pending' check (status in ('pending','needs_match','accepted','dismissed','source_withdrawn')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (source_kind, source_record_id)
);

create index if not exists maklom_profile_inbox_status_idx
  on public.maklom_profile_inbox(status, created_at desc);
create index if not exists maklom_profile_inbox_volunteer_idx
  on public.maklom_profile_inbox(volunteer_id, created_at desc);

alter table public.maklom_profile_inbox enable row level security;

create policy maklom_profile_inbox_read_members
on public.maklom_profile_inbox for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));
create policy maklom_profile_inbox_update_editors
on public.maklom_profile_inbox for update to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
))
with check (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
));

grant select, update on public.maklom_profile_inbox to authenticated;
grant select, insert, update on public.maklom_profile_inbox to service_role;

create or replace function core.sync_insight_to_maklom_inbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  canonical_volunteer_id uuid;
begin
  select roster.volunteer_id
  into canonical_volunteer_id
  from public.phaseone_roster roster
  where roster.id = new.roster_id;

  if new.review_status = 'accepted' then
    insert into public.maklom_profile_inbox (
      volunteer_id, source_kind, source_record_id, event_id,
      source_person_key, title, payload, status, updated_at
    ) values (
      canonical_volunteer_id,
      'insight',
      new.id,
      new.event_id,
      new.volunteer_person_key,
      new.category || ': ' || new.value,
      jsonb_build_object(
        'category', new.category,
        'value', new.value,
        'detail', new.detail,
        'source_type', new.source_type,
        'captured_at', new.captured_at,
        'reviewed_at', new.reviewed_at
      ),
      case when canonical_volunteer_id is null then 'needs_match' else 'pending' end,
      now()
    )
    on conflict (source_kind, source_record_id) do update
    set
      volunteer_id = excluded.volunteer_id,
      event_id = excluded.event_id,
      source_person_key = excluded.source_person_key,
      title = excluded.title,
      payload = excluded.payload,
      status = case when excluded.volunteer_id is null then 'needs_match' else 'pending' end,
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      updated_at = now();
  else
    update public.maklom_profile_inbox
    set status = 'source_withdrawn', updated_at = now()
    where source_kind = 'insight' and source_record_id = new.id;
  end if;

  return new;
end;
$$;

revoke all on function core.sync_insight_to_maklom_inbox() from public, anon, authenticated;

drop trigger if exists volunteer_insights_sync_maklom_inbox on public.phaseone_volunteer_insights;
create trigger volunteer_insights_sync_maklom_inbox
after insert or update of review_status, category, value, detail, roster_id
on public.phaseone_volunteer_insights
for each row execute function core.sync_insight_to_maklom_inbox();

create or replace function core.sync_review_to_maklom_inbox()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  canonical_volunteer_id uuid;
begin
  select roster.volunteer_id
  into canonical_volunteer_id
  from public.phaseone_roster roster
  where roster.id = new.roster_id;

  insert into public.maklom_profile_inbox (
    volunteer_id, source_kind, source_record_id, event_id,
    source_person_key, title, payload, status, updated_at
  ) values (
    canonical_volunteer_id,
    'review',
    new.id,
    new.event_id,
    new.volunteer_person_key,
    'Event performance review',
    jsonb_build_object(
      'rating', new.rating,
      'positive_behaviors', new.positive_behaviors,
      'concern_behaviors', new.concern_behaviors,
      'comment', new.comment,
      'follow_up_required', new.follow_up_required,
      'reviewed_at', new.reviewed_at
    ),
    case when canonical_volunteer_id is null then 'needs_match' else 'pending' end,
    now()
  )
  on conflict (source_kind, source_record_id) do update
  set
    volunteer_id = excluded.volunteer_id,
    event_id = excluded.event_id,
    source_person_key = excluded.source_person_key,
    title = excluded.title,
    payload = excluded.payload,
    status = case when excluded.volunteer_id is null then 'needs_match' else 'pending' end,
    reviewed_by = null,
    reviewed_at = null,
    review_note = null,
    updated_at = now();

  return new;
end;
$$;

revoke all on function core.sync_review_to_maklom_inbox() from public, anon, authenticated;

drop trigger if exists volunteer_reviews_sync_maklom_inbox on public.phaseone_volunteer_reviews;
create trigger volunteer_reviews_sync_maklom_inbox
after insert or update of rating, positive_behaviors, concern_behaviors, comment, follow_up_required, roster_id
on public.phaseone_volunteer_reviews
for each row execute function core.sync_review_to_maklom_inbox();

insert into public.maklom_profile_inbox (
  volunteer_id, source_kind, source_record_id, event_id,
  source_person_key, title, payload, status
)
select
  roster.volunteer_id,
  'insight',
  insight.id,
  insight.event_id,
  insight.volunteer_person_key,
  insight.category || ': ' || insight.value,
  jsonb_build_object(
    'category', insight.category,
    'value', insight.value,
    'detail', insight.detail,
    'source_type', insight.source_type,
    'captured_at', insight.captured_at,
    'reviewed_at', insight.reviewed_at
  ),
  case when roster.volunteer_id is null then 'needs_match' else 'pending' end
from public.phaseone_volunteer_insights insight
join public.phaseone_roster roster on roster.id = insight.roster_id
where insight.review_status = 'accepted'
on conflict (source_kind, source_record_id) do nothing;

insert into public.maklom_profile_inbox (
  volunteer_id, source_kind, source_record_id, event_id,
  source_person_key, title, payload, status
)
select
  roster.volunteer_id,
  'review',
  review.id,
  review.event_id,
  review.volunteer_person_key,
  'Event performance review',
  jsonb_build_object(
    'rating', review.rating,
    'positive_behaviors', review.positive_behaviors,
    'concern_behaviors', review.concern_behaviors,
    'comment', review.comment,
    'follow_up_required', review.follow_up_required,
    'reviewed_at', review.reviewed_at
  ),
  case when roster.volunteer_id is null then 'needs_match' else 'pending' end
from public.phaseone_volunteer_reviews review
join public.phaseone_roster roster on roster.id = review.roster_id
on conflict (source_kind, source_record_id) do nothing;

comment on column core.volunteers.official_hours_12_months is
  'Dormant future integration field. Current approved volunteer hours are derived from MakLom-reviewed public.volunteer_contributions.';
comment on column core.volunteers.official_hours_24_months is
  'Dormant future integration field. Current approved volunteer hours are derived from MakLom-reviewed public.volunteer_contributions.';
