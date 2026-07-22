create extension if not exists pgcrypto;

create table public.phaseone_external_opportunities (
  id uuid primary key default gen_random_uuid(),
  source_key text not null unique,
  title text not null,
  summary text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  venue text,
  source_url text not null,
  source_updated_at timestamptz,
  imported_at timestamptz not null default now(),
  is_active boolean not null default true,
  raw_payload jsonb not null default '{}'::jsonb,
  constraint phaseone_external_opportunities_source_url_https
    check (source_url ~ '^https://([a-z0-9-]+\.)*volunteer\.gov\.sg(/|$)')
);

create index phaseone_external_opportunities_upcoming_idx
  on public.phaseone_external_opportunities (is_active, starts_at);

create table public.phaseone_events (
  id uuid primary key default gen_random_uuid(),
  external_opportunity_id uuid references public.phaseone_external_opportunities(id) on delete set null,
  title text not null,
  slug text not null unique,
  reporting_at timestamptz,
  venue text,
  briefing_url text,
  whatsapp_url text,
  sign_in_url text,
  sign_out_url text,
  pin_salt text,
  pin_hash text,
  pin_updated_at timestamptz,
  is_published boolean not null default false,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_events_slug_format check (slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  constraint phaseone_events_briefing_https check (briefing_url is null or briefing_url ~ '^https://'),
  constraint phaseone_events_whatsapp_https check (whatsapp_url is null or whatsapp_url ~ '^https://'),
  constraint phaseone_events_sign_in_https check (sign_in_url is null or sign_in_url ~ '^https://'),
  constraint phaseone_events_sign_out_https check (sign_out_url is null or sign_out_url ~ '^https://'),
  constraint phaseone_events_pin_pair check ((pin_salt is null) = (pin_hash is null))
);

create table public.phaseone_roster (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  volunteer_key text not null,
  volunteer_name text not null,
  email text,
  mobile text,
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now(),
  unique (event_id, volunteer_key)
);

create table public.phaseone_attendance (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  signed_in_at timestamptz,
  signed_out_at timestamptz,
  signed_in_marked_by uuid references auth.users(id),
  signed_out_marked_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, roster_id),
  constraint phaseone_attendance_order check (
    signed_in_at is null or signed_out_at is null or signed_out_at >= signed_in_at
  )
);

create table public.phaseone_import_runs (
  id uuid primary key default gen_random_uuid(),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  status text not null check (status in ('running', 'succeeded', 'failed')),
  imported_count integer not null default 0 check (imported_count >= 0),
  error_code text,
  error_detail text
);

alter table public.phaseone_external_opportunities enable row level security;
alter table public.phaseone_events enable row level security;
alter table public.phaseone_roster enable row level security;
alter table public.phaseone_attendance enable row level security;
alter table public.phaseone_import_runs enable row level security;

create policy "Public can read active imported opportunities"
on public.phaseone_external_opportunities
for select
to anon, authenticated
using (is_active = true);

create policy "Public can read published event operations"
on public.phaseone_events
for select
to anon, authenticated
using (is_published = true);

-- Staff writes use server-side application authorization and the service role.
-- No direct browser write policies are granted for the phase-one tables.

revoke all on public.phaseone_external_opportunities from anon, authenticated;
revoke all on public.phaseone_events from anon, authenticated;
revoke all on public.phaseone_roster from anon, authenticated;
revoke all on public.phaseone_attendance from anon, authenticated;
revoke all on public.phaseone_import_runs from anon, authenticated;

grant select on public.phaseone_external_opportunities to anon, authenticated;
grant select (
  id,
  external_opportunity_id,
  title,
  slug,
  reporting_at,
  venue,
  briefing_url,
  whatsapp_url,
  is_published,
  created_at,
  updated_at
) on public.phaseone_events to anon, authenticated;

comment on column public.phaseone_events.pin_hash is
  'Server-generated scrypt hash. Never return this column to volunteers or browser clients.';
comment on column public.phaseone_events.pin_salt is
  'Per-event random salt. Never return this column to volunteers or browser clients.';
