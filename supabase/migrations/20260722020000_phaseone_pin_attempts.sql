alter table public.phaseone_events
  add column has_pin boolean generated always as (pin_hash is not null) stored;

grant select (has_pin) on public.phaseone_events to anon, authenticated;

create table public.phaseone_pin_attempts (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  client_key text not null,
  attempted_at timestamptz not null default now(),
  was_successful boolean not null default false,
  constraint phaseone_pin_attempts_client_key_format
    check (client_key ~ '^[a-f0-9]{64}$')
);

create index phaseone_pin_attempts_rate_limit_idx
  on public.phaseone_pin_attempts (event_id, client_key, attempted_at desc)
  where was_successful = false;

alter table public.phaseone_pin_attempts enable row level security;

revoke all on public.phaseone_pin_attempts from anon, authenticated;

comment on column public.phaseone_events.has_pin is
  'Public-safe indicator that event access has been configured; does not expose PIN material.';
comment on table public.phaseone_pin_attempts is
  'Server-only audit and rate-limit records for phase-one event PIN verification.';
comment on column public.phaseone_pin_attempts.client_key is
  'HMAC-SHA256 fingerprint of request network and user-agent signals; never stores a raw IP address.';
