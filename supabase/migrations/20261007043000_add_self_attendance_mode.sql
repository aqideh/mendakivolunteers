alter table public.phaseone_events
  add column if not exists self_attendance_enabled boolean not null default false;

comment on column public.phaseone_events.self_attendance_enabled is
  'When enabled, rostered volunteers may use the event self-attendance flow when no staff are present.';
