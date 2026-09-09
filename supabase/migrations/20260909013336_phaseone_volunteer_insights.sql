create table if not exists public.phaseone_volunteer_insights (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  timeslot_id uuid references public.phaseone_event_timeslots(id) on delete set null,
  volunteer_person_key text not null,
  category text not null,
  value text not null,
  detail text,
  source_type text not null default 'volunteer_shared',
  review_status text not null default 'submitted',
  captured_by uuid not null references auth.users(id),
  captured_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id),
  reviewed_at timestamptz,
  constraint phaseone_volunteer_insights_category_check check (
    category in ('skill','interest','experience','connection','role_preference','availability','language','development','follow_up','note')
  ),
  constraint phaseone_volunteer_insights_value_length check (char_length(btrim(value)) between 1 and 240),
  constraint phaseone_volunteer_insights_detail_length check (detail is null or char_length(detail) <= 1500),
  constraint phaseone_volunteer_insights_source_check check (source_type in ('volunteer_shared','staff_observed')),
  constraint phaseone_volunteer_insights_review_check check (review_status in ('submitted','accepted','dismissed')),
  constraint phaseone_volunteer_insights_review_metadata_check check (
    (review_status = 'submitted' and reviewed_by is null and reviewed_at is null)
    or (review_status in ('accepted','dismissed') and reviewed_by is not null and reviewed_at is not null)
  )
);

create index if not exists phaseone_volunteer_insights_event_idx
  on public.phaseone_volunteer_insights (event_id, review_status, captured_at desc);
create index if not exists phaseone_volunteer_insights_person_idx
  on public.phaseone_volunteer_insights (volunteer_person_key, captured_at desc);
create index if not exists phaseone_volunteer_insights_roster_idx
  on public.phaseone_volunteer_insights (roster_id, captured_at desc);

alter table public.phaseone_volunteer_insights enable row level security;

revoke all on public.phaseone_volunteer_insights from anon, authenticated;
grant select, insert, update, delete on public.phaseone_volunteer_insights to service_role;

comment on table public.phaseone_volunteer_insights is
  'Staff-captured, event-sourced volunteer profile observations. Accepted rows are eligible for reviewed handoff to MakLom; they do not directly mutate canonical volunteer profiles.';
comment on column public.phaseone_volunteer_insights.volunteer_person_key is
  'Stable event-operations person key copied from phaseone_roster.attendance_person_key so insights can follow the same volunteer across shifts.';
