begin;

-- An event-day leader is a scoped delegation, not a global staff role.
-- Preserve existing user-based assignments while allowing an existing volunteer
-- to be pre-assigned before they have linked a Keluarga Auth account.
alter table public.phaseone_event_volunteer_leaders
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists volunteer_id uuid references core.volunteers(id) on delete cascade;

update public.phaseone_event_volunteer_leaders
set id = gen_random_uuid()
where id is null;

alter table public.phaseone_event_volunteer_leaders
  drop constraint if exists phaseone_event_volunteer_leaders_pkey;

alter table public.phaseone_event_volunteer_leaders
  alter column id set not null,
  alter column user_id drop not null,
  add constraint phaseone_event_volunteer_leaders_pkey primary key (id),
  add constraint phaseone_event_volunteer_leaders_one_identity
    check ((user_id is not null) <> (volunteer_id is not null));

create unique index if not exists phaseone_event_volunteer_leaders_event_user_unique
  on public.phaseone_event_volunteer_leaders(event_id, user_id);

create unique index if not exists phaseone_event_volunteer_leaders_event_volunteer_unique
  on public.phaseone_event_volunteer_leaders(event_id, volunteer_id);

create index if not exists phaseone_event_volunteer_leaders_volunteer_idx
  on public.phaseone_event_volunteer_leaders(volunteer_id, event_id)
  where volunteer_id is not null;

comment on table public.phaseone_event_volunteer_leaders is
  'Event-scoped attendance delegation for a volunteer identity or a legacy staff account; never a promotion to staff access.';

comment on column public.phaseone_event_volunteer_leaders.volunteer_id is
  'Canonical volunteer identity. Attendance access only activates after core.volunteers.auth_user_id links to an active account.';

commit;
