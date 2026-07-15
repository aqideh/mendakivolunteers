begin;

create schema if not exists ymhub;

comment on schema ymhub is
  'Read-only application projection of authoritative downstream YM Hub data.';

revoke all on schema ymhub from public;
grant usage on schema ymhub to authenticated, service_role;

create type ymhub.registration_state as enum (
  'registered',
  'waitlisted',
  'cancelled'
);

create type ymhub.attendance_state as enum (
  'pending',
  'verified',
  'rejected',
  'cancelled'
);

create or replace function core.current_volunteer_id()
returns uuid
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select volunteers.id
  from core.volunteers as volunteers
  join core.user_accounts as accounts
    on accounts.id = volunteers.auth_user_id
  where volunteers.auth_user_id = auth.uid()
    and accounts.status = 'active';
$$;

comment on function core.current_volunteer_id() is
  'Returns the current active account''s internal volunteer UUID for RLS evaluation.';

create table ymhub.volunteer_sync_status (
  volunteer_id uuid primary key references core.volunteers (id) on delete cascade,
  registrations_synced_at timestamptz,
  attendance_synced_at timestamptz,
  last_attempted_at timestamptz not null,
  last_successful_at timestamptz,
  last_failed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_sync_status_has_outcome check (
    last_successful_at is not null or last_failed_at is not null
  ),
  constraint volunteer_sync_status_success_order check (
    last_successful_at is null or last_successful_at <= last_attempted_at
  ),
  constraint volunteer_sync_status_failure_order check (
    last_failed_at is null or last_failed_at <= last_attempted_at
  ),
  constraint volunteer_sync_status_registration_order check (
    registrations_synced_at is null
    or (
      last_successful_at is not null
      and registrations_synced_at <= last_successful_at
    )
  ),
  constraint volunteer_sync_status_attendance_order check (
    attendance_synced_at is null
    or (
      last_successful_at is not null
      and attendance_synced_at <= last_successful_at
    )
  )
);

comment on table ymhub.volunteer_sync_status is
  'Per-volunteer sync outcome used to distinguish an authoritative empty result from unavailable downstream data.';

create table ymhub.registration_snapshots (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers (id) on delete cascade,
  ymhub_registration_id text not null unique check (
    char_length(ymhub_registration_id) between 1 and 128
  ),
  ymhub_activity_id text not null check (
    char_length(ymhub_activity_id) between 1 and 128
  ),
  activity_title text not null check (
    char_length(activity_title) between 1 and 240
  ),
  activity_category text check (
    activity_category is null or char_length(activity_category) between 1 and 100
  ),
  activity_starts_at timestamptz not null,
  activity_ends_at timestamptz,
  registered_at timestamptz,
  state ymhub.registration_state not null,
  source_status text not null check (
    char_length(source_status) between 1 and 100
  ),
  source_updated_at timestamptz not null,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_snapshots_activity_time_order check (
    activity_ends_at is null or activity_ends_at >= activity_starts_at
  )
);

comment on table ymhub.registration_snapshots is
  'Read-only registration projection. The portal never creates or changes authoritative registrations in YM Hub.';

create index registration_snapshots_volunteer_start_idx
  on ymhub.registration_snapshots (volunteer_id, activity_starts_at desc);

create index registration_snapshots_upcoming_idx
  on ymhub.registration_snapshots (volunteer_id, activity_starts_at)
  where state in ('registered', 'waitlisted');

create index registration_snapshots_activity_idx
  on ymhub.registration_snapshots (ymhub_activity_id, volunteer_id);

create table ymhub.attendance_snapshots (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers (id) on delete cascade,
  ymhub_attendance_id text not null unique check (
    char_length(ymhub_attendance_id) between 1 and 128
  ),
  ymhub_activity_id text not null check (
    char_length(ymhub_activity_id) between 1 and 128
  ),
  activity_title text not null check (
    char_length(activity_title) between 1 and 240
  ),
  activity_category text check (
    activity_category is null or char_length(activity_category) between 1 and 100
  ),
  activity_starts_at timestamptz not null,
  activity_ends_at timestamptz,
  state ymhub.attendance_state not null,
  source_status text not null check (
    char_length(source_status) between 1 and 100
  ),
  verified_hours numeric(8, 2),
  verified_at timestamptz,
  source_updated_at timestamptz not null,
  last_synced_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_snapshots_activity_time_order check (
    activity_ends_at is null or activity_ends_at >= activity_starts_at
  ),
  constraint attendance_snapshots_verified_hours_nonnegative check (
    verified_hours is null or verified_hours >= 0
  ),
  constraint attendance_snapshots_verification_consistent check (
    (
      state = 'verified'
      and verified_hours is not null
      and verified_at is not null
    )
    or (
      state <> 'verified'
      and verified_hours is null
      and verified_at is null
    )
  )
);

comment on table ymhub.attendance_snapshots is
  'Read-only attendance projection. Only verified records contain official hours and verification timestamps.';

create index attendance_snapshots_volunteer_start_idx
  on ymhub.attendance_snapshots (volunteer_id, activity_starts_at desc);

create index attendance_snapshots_verified_idx
  on ymhub.attendance_snapshots (volunteer_id, verified_at desc)
  where state = 'verified';

create index attendance_snapshots_activity_idx
  on ymhub.attendance_snapshots (ymhub_activity_id, volunteer_id);

create trigger volunteer_sync_status_set_updated_at
before update on ymhub.volunteer_sync_status
for each row execute function core.set_updated_at();

create trigger registration_snapshots_set_updated_at
before update on ymhub.registration_snapshots
for each row execute function core.set_updated_at();

create trigger attendance_snapshots_set_updated_at
before update on ymhub.attendance_snapshots
for each row execute function core.set_updated_at();

alter table ymhub.volunteer_sync_status enable row level security;
alter table ymhub.volunteer_sync_status force row level security;
alter table ymhub.registration_snapshots enable row level security;
alter table ymhub.registration_snapshots force row level security;
alter table ymhub.attendance_snapshots enable row level security;
alter table ymhub.attendance_snapshots force row level security;

create policy volunteer_sync_status_select_self
on ymhub.volunteer_sync_status
for select
to authenticated
using (volunteer_id = (select core.current_volunteer_id()));

create policy volunteer_sync_status_select_support
on ymhub.volunteer_sync_status
for select
to authenticated
using ((select core.can_support_volunteers()));

create policy registration_snapshots_select_self
on ymhub.registration_snapshots
for select
to authenticated
using (volunteer_id = (select core.current_volunteer_id()));

create policy registration_snapshots_select_support
on ymhub.registration_snapshots
for select
to authenticated
using ((select core.can_support_volunteers()));

create policy attendance_snapshots_select_self
on ymhub.attendance_snapshots
for select
to authenticated
using (volunteer_id = (select core.current_volunteer_id()));

create policy attendance_snapshots_select_support
on ymhub.attendance_snapshots
for select
to authenticated
using ((select core.can_support_volunteers()));

revoke all on all tables in schema ymhub from anon, authenticated;
revoke all on all sequences in schema ymhub from anon, authenticated;
revoke all on all functions in schema ymhub from public, anon, authenticated;

revoke all on function core.current_volunteer_id()
  from public, anon, authenticated;

grant execute on function core.current_volunteer_id()
  to authenticated, service_role;

grant select on ymhub.volunteer_sync_status to authenticated;
grant select on ymhub.registration_snapshots to authenticated;
grant select on ymhub.attendance_snapshots to authenticated;

grant all on all tables in schema ymhub to service_role;
grant all on all sequences in schema ymhub to service_role;
grant execute on all functions in schema ymhub to service_role;

alter default privileges in schema ymhub
  revoke all on tables from anon, authenticated;
alter default privileges in schema ymhub
  revoke all on sequences from anon, authenticated;
alter default privileges in schema ymhub
  revoke execute on functions from public, anon, authenticated;

commit;
