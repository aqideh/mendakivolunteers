begin;

alter table public.keluarga_volunteer_profiles
  add column if not exists availability_slots text[] not null default '{}'::text[],
  add column if not exists preferred_commitment text,
  add column if not exists onboarding_completed_at timestamptz;

alter table public.keluarga_volunteer_profiles
  drop constraint if exists keluarga_volunteer_profiles_availability_slots_check,
  add constraint keluarga_volunteer_profiles_availability_slots_check check (
    cardinality(availability_slots) <= 5
    and availability_slots <@ array[
      'weekday_daytime',
      'weekday_evening',
      'saturday',
      'sunday',
      'ad_hoc'
    ]::text[]
  ),
  drop constraint if exists keluarga_volunteer_profiles_preferred_commitment_check,
  add constraint keluarga_volunteer_profiles_preferred_commitment_check check (
    preferred_commitment is null
    or preferred_commitment in (
      'one_off',
      'monthly',
      'fortnightly',
      'weekly',
      'flexible'
    )
  );

comment on column public.keluarga_volunteer_profiles.availability_slots is
  'Volunteer-selected availability categories used by KELUARGA for matching and planning.';
comment on column public.keluarga_volunteer_profiles.preferred_commitment is
  'Volunteer-selected preferred volunteering cadence.';
comment on column public.keluarga_volunteer_profiles.onboarding_completed_at is
  'Timestamp when the volunteer completed the guided KELUARGA profile setup journey.';

-- Keep account creation link-aware. A new auth account must first be matched
-- against an existing canonical volunteer by ensure_current_keluarga_volunteer()
-- after email verification; only then should a new volunteer be created.
create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  insert into core.user_accounts (id, display_name)
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '')
  )
  on conflict (id) do nothing;

  insert into core.user_roles (user_id, role, reason)
  values (new.id, 'volunteer', 'Default role assigned at account creation')
  on conflict (user_id, role) do nothing;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object('default_role', 'volunteer'),
    new.id,
    null
  );

  return new;
end;
$$;

commit;
