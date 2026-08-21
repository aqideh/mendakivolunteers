alter table if exists public.phaseone_events
  add column if not exists programme_rundown_url text;

comment on column public.phaseone_events.programme_rundown_url is
  'Optional HTTPS image URL for the volunteer-facing programme rundown.';
