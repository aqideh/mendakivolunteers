begin;

create schema if not exists ymhub;

comment on schema ymhub is
  'Read-only application projection of downstream data from the authoritative YM Hub Salesforce database.';

revoke all on schema ymhub from public;
grant usage on schema ymhub to authenticated, service_role;

create type ymhub.registration_state as enum (
  'registered',
  'waitlisted',
  'cancelled',
  'unknown'
);

create type ymhub.attendance_state as enum (
  'pending',
  'verified',
  'rejected',
  'cancelled',
  'unknown'
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
    and accounts.status = 'active'
  limit 1;
$$;

comment on function core.current_volunteer_id() is
  'Returns the current active account''s internal volunteer UUID without exposing the YM Hub volunteer ID.';

create table ymhub.registration_snapshots (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers (id) on delete cascade,
  ymhub_registration_id text not null check (
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
  state ymhub.registration_state not null default 'unknown',
  source_status text check (
    source_status is null or char_length(source_status) between 1 and 100
  ),
  source_updated_at timestamptz not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint registration_snapshots_source_record_unique
    unique (volunteer_id, ymhub_registration_id),
  constraint registration_snapshots_activity_time_order check (
    activity_ends_at is null or activity_ends_at >= activity_starts_at
  ),
  constraint registration_snapshots_sync_time_order check (
    last_synced_at >= source_updated_at
  )
);

comment on table ymhub.registration_snapshots is
  'Downstream registration projection. The app never creates or changes the authoritative registration in YM Hub.';
comment on column ymhub.registration_snapshots.state is
  'Canonical application state mapped by the YM Hub adapter from placeholder or production source labels.';

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
  ymhub_attendance_id text not null check (
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
  state ymhub.attendance_state not null default 'unknown',
  source_status text check (
    source_status is null or char_length(source_status) between 1 and 100
  ),
  verified_hours numeric(8, 2),
  verified_at timestamptz,
  source_updated_at timestamptz not null,
  last_synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint attendance_snapshots_source_record_unique
    unique (volunteer_id, ymhub_attendance_id),
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
  ),
  constraint attendance_snapshots_sync_time_order check (
    last_synced_at >= source_updated_at
  )
);

comment on table ymhub.attendance_snapshots is
  'Downstream attendance projection. Only YM Hub-verified records contribute to official dashboard hours and completions.';
comment on column ymhub.attendance_snapshots.state is
  'Canonical application state mapped by the YM Hub adapter from placeholder or production source labels.';

create index attendance_snapshots_volunteer_start_idx
  on ymhub.attendance_snapshots (volunteer_id, activity_starts_at desc);

create index attendance_snapshots_verified_idx
  on ymhub.attendance_snapshots (volunteer_id, verified_at desc)
  where state = 'verified';

create index attendance_snapshots_activity_idx
  on ymhub.attendance_snapshots (ymhub_activity_id, volunteer_id);

create trigger registration_snapshots_set_updated_at
before update on ymhub.registration_snapshots
for each row execute function core.set_updated_at();

create trigger attendance_snapshots_set_updated_at
before update on ymhub.attendance_snapshots
for each row execute function core.set_updated_at();

alter table ymhub.registration_snapshots enable row level security;
alter table ymhub.registration_snapshots force row level security;
alter table ymhub.attendance_snapshots enable row level security;
alter table ymhub.attendance_snapshots force row level security;

create policy registration_snapshots_select_self
on ymhub.registration_snapshots
for select
to authenticated
using (
  volunteer_id = (select core.current_volunteer_id())
);

create policy registration_snapshots_select_support
on ymhub.registration_snapshots
for select
to authenticated
using (
  (select core.can_support_volunteers())
);

create policy attendance_snapshots_select_self
on ymhub.attendance_snapshots
for select
to authenticated
using (
  volunteer_id = (select core.current_volunteer_id())
);

create policy attendance_snapshots_select_support
on ymhub.attendance_snapshots
for select
to authenticated
using (
  (select core.can_support_volunteers())
);

revoke all on all tables in schema ymhub from anon, authenticated;
revoke all on all sequences in schema ymhub from anon, authenticated;
revoke all on all functions in schema ymhub from public, anon, authenticated;

revoke all on function core.current_volunteer_id()
  from public, anon, authenticated;

grant execute on function core.current_volunteer_id()
  to authenticated, service_role;
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
