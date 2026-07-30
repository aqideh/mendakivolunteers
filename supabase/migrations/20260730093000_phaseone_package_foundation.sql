alter table public.phaseone_events
  add column briefing_available_at timestamptz,
  add column sign_in_pin_salt text,
  add column sign_in_pin_hash text,
  add column sign_in_pin_updated_at timestamptz,
  add column sign_out_pin_salt text,
  add column sign_out_pin_hash text,
  add column sign_out_pin_updated_at timestamptz,
  add column has_sign_in_pin boolean
    generated always as (sign_in_pin_hash is not null) stored,
  add column has_sign_out_pin boolean
    generated always as (sign_out_pin_hash is not null) stored;

-- Preserve every configured legacy PIN as both action-specific PINs. The
-- fallback timestamp handles older records created before pin_updated_at was
-- consistently populated.
update public.phaseone_events
set
  sign_in_pin_salt = pin_salt,
  sign_in_pin_hash = pin_hash,
  sign_in_pin_updated_at = case
    when pin_hash is null then null
    else coalesce(pin_updated_at, updated_at, created_at, now())
  end,
  sign_out_pin_salt = pin_salt,
  sign_out_pin_hash = pin_hash,
  sign_out_pin_updated_at = case
    when pin_hash is null then null
    else coalesce(pin_updated_at, updated_at, created_at, now())
  end;

alter table public.phaseone_events
  add constraint phaseone_events_sign_in_pin_set
    check (
      (
        sign_in_pin_salt is null
        and sign_in_pin_hash is null
        and sign_in_pin_updated_at is null
      )
      or
      (
        sign_in_pin_salt is not null
        and sign_in_pin_hash is not null
        and sign_in_pin_updated_at is not null
      )
    ),
  add constraint phaseone_events_sign_out_pin_set
    check (
      (
        sign_out_pin_salt is null
        and sign_out_pin_hash is null
        and sign_out_pin_updated_at is null
      )
      or
      (
        sign_out_pin_salt is not null
        and sign_out_pin_hash is not null
        and sign_out_pin_updated_at is not null
      )
    );

-- Keep the current CMS and API safe during the transition. Legacy writes are
-- mirrored only when the legacy PIN fields change, so later slices can update
-- either action-specific PIN independently.
create function public.phaseone_sync_legacy_event_pin()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT'
    or (
      new.pin_salt,
      new.pin_hash,
      new.pin_updated_at
    ) is distinct from (
      old.pin_salt,
      old.pin_hash,
      old.pin_updated_at
    )
  then
    if new.pin_salt is null and new.pin_hash is null then
      new.sign_in_pin_salt := null;
      new.sign_in_pin_hash := null;
      new.sign_in_pin_updated_at := null;
      new.sign_out_pin_salt := null;
      new.sign_out_pin_hash := null;
      new.sign_out_pin_updated_at := null;
    else
      new.sign_in_pin_salt := new.pin_salt;
      new.sign_in_pin_hash := new.pin_hash;
      new.sign_in_pin_updated_at := coalesce(
        new.pin_updated_at,
        new.updated_at,
        new.created_at,
        now()
      );
      new.sign_out_pin_salt := new.pin_salt;
      new.sign_out_pin_hash := new.pin_hash;
      new.sign_out_pin_updated_at := coalesce(
        new.pin_updated_at,
        new.updated_at,
        new.created_at,
        now()
      );
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.phaseone_sync_legacy_event_pin()
  from public, anon, authenticated;

create trigger phaseone_events_sync_legacy_pin
before insert or update on public.phaseone_events
for each row execute function public.phaseone_sync_legacy_event_pin();

alter table public.phaseone_pin_attempts
  add column action_type text not null default 'legacy',
  add constraint phaseone_pin_attempts_action_type_check
    check (action_type in ('legacy', 'sign_in', 'sign_out'));

-- Retain the legacy index for the currently deployed endpoint, while adding
-- the action-specific access path required by the later independent flows.
create index phaseone_pin_attempts_action_rate_limit_idx
  on public.phaseone_pin_attempts (
    event_id,
    action_type,
    client_key,
    attempted_at desc
  )
  where was_successful = false;

create index phaseone_events_published_reporting_at_idx
  on public.phaseone_events (reporting_at, id)
  where is_published = true;

-- The briefing destination is protected server-side in a later slice. Remove
-- it from the public Data API now, while exposing only safe schedule/status
-- metadata.
revoke select (briefing_url) on public.phaseone_events
  from anon, authenticated;

grant select (
  briefing_available_at,
  has_sign_in_pin,
  has_sign_out_pin
) on public.phaseone_events to anon, authenticated;

comment on column public.phaseone_events.briefing_available_at is
  'Earliest instant at which the server may expose the briefing destination.';
comment on column public.phaseone_events.sign_in_pin_hash is
  'Server-generated sign-in PIN hash. Never return this column to browser clients.';
comment on column public.phaseone_events.sign_in_pin_salt is
  'Per-event sign-in PIN salt. Never return this column to browser clients.';
comment on column public.phaseone_events.sign_out_pin_hash is
  'Server-generated sign-out PIN hash. Never return this column to browser clients.';
comment on column public.phaseone_events.sign_out_pin_salt is
  'Per-event sign-out PIN salt. Never return this column to browser clients.';
comment on column public.phaseone_events.has_sign_in_pin is
  'Public-safe indicator that sign-in access is configured.';
comment on column public.phaseone_events.has_sign_out_pin is
  'Public-safe indicator that sign-out access is configured.';
comment on column public.phaseone_pin_attempts.action_type is
  'PIN flow being rate-limited: legacy, sign_in, or sign_out.';

