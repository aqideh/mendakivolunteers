create table public.phaseone_event_form_drafts (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null default '{}'::jsonb
    check (jsonb_typeof(payload) = 'object'),
  updated_at timestamptz not null default now()
);

alter table public.phaseone_event_form_drafts enable row level security;
revoke all on public.phaseone_event_form_drafts from public, anon, authenticated;
grant select, insert, update, delete on public.phaseone_event_form_drafts to service_role;

comment on table public.phaseone_event_form_drafts is
  'Server-managed recovery drafts for the KELUARGA new-programme form. One active draft per staff user.';
