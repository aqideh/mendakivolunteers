begin;

create table if not exists public.phaseone_event_volunteer_leaders (
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  user_id uuid not null references core.user_accounts(id) on delete cascade,
  assigned_by uuid references core.user_accounts(id) on delete set null,
  assigned_at timestamptz not null default now(),
  primary key (event_id, user_id)
);

comment on table public.phaseone_event_volunteer_leaders is
  'Event-scoped authorization assignments for users with the volunteer_leader access level.';

create index if not exists phaseone_event_volunteer_leaders_user_idx
  on public.phaseone_event_volunteer_leaders(user_id, event_id);

alter table public.phaseone_event_volunteer_leaders enable row level security;

revoke all on table public.phaseone_event_volunteer_leaders from public, anon, authenticated;
grant select, insert, update, delete on table public.phaseone_event_volunteer_leaders to service_role;

commit;
