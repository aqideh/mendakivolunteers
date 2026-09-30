begin;

alter table core.user_accounts
  add column if not exists claimed_email_normalized text,
  add column if not exists email_ownership_verified boolean not null default false,
  add column if not exists email_ownership_verified_at timestamptz;

alter table core.user_accounts
  drop constraint if exists user_accounts_claimed_email_normalized_format;

alter table core.user_accounts
  add constraint user_accounts_claimed_email_normalized_format check (
    claimed_email_normalized is null
    or (
      claimed_email_normalized = lower(btrim(claimed_email_normalized))
      and char_length(claimed_email_normalized) between 3 and 254
      and claimed_email_normalized like '%@%'
    )
  );

comment on column core.user_accounts.claimed_email_normalized is
  'Email supplied for KELUARGA sign-in and contact. It is not an identity-linking key until email_ownership_verified is true.';
comment on column core.user_accounts.email_ownership_verified is
  'KELUARGA identity-assurance flag. Do not infer this value from auth.users.email_confirmed_at for password-bypass accounts.';
comment on column core.user_accounts.email_ownership_verified_at is
  'Timestamp when KELUARGA independently verified ownership of the claimed email address.';

update core.user_accounts account
set
  claimed_email_normalized = lower(btrim(auth_user.email)),
  email_ownership_verified = true,
  email_ownership_verified_at = coalesce(
    auth_user.email_confirmed_at,
    auth_user.confirmed_at,
    account.created_at
  )
from auth.users auth_user
where auth_user.id = account.id
  and auth_user.email is not null
  and coalesce(auth_user.email_confirmed_at, auth_user.confirmed_at) is not null
  and account.email_ownership_verified = false;

create table if not exists core.auth_signup_attempts (
  id bigint generated always as identity primary key,
  client_key text not null check (client_key ~ '^[a-f0-9]{64}$'),
  email_key text not null check (email_key ~ '^[a-f0-9]{64}$'),
  was_successful boolean not null default false,
  attempted_at timestamptz not null default now()
);

create index if not exists auth_signup_attempts_client_time_idx
  on core.auth_signup_attempts(client_key, attempted_at desc);
create index if not exists auth_signup_attempts_email_time_idx
  on core.auth_signup_attempts(email_key, attempted_at desc);

comment on table core.auth_signup_attempts is
  'Server-only hashed abuse-control events for temporary password-based volunteer signup. Raw IP addresses and email addresses are not stored.';

alter table core.auth_signup_attempts enable row level security;
alter table core.auth_signup_attempts force row level security;
revoke all on core.auth_signup_attempts from public, anon, authenticated;
grant select, insert, delete on core.auth_signup_attempts to service_role;
grant usage, select on sequence core.auth_signup_attempts_id_seq to service_role;

create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
begin
  insert into core.user_accounts (
    id,
    display_name,
    claimed_email_normalized
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    case
      when new.email is null then null
      else lower(btrim(new.email))
    end
  )
  on conflict (id) do update
  set claimed_email_normalized = coalesce(
    core.user_accounts.claimed_email_normalized,
    excluded.claimed_email_normalized
  );

  insert into core.user_roles (user_id, role, reason)
  values (new.id, 'volunteer', 'Default role assigned at account creation')
  on conflict (user_id, role) do nothing;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object(
      'default_role', 'volunteer',
      'email_ownership_verified', false
    ),
    new.id,
    null
  );

  return new;
end;
$$;

create or replace function core.ensure_current_keluarga_volunteer()
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'core', 'auth', 'audit'
as $$
declare
  current_user_id uuid := auth.uid();
  current_status core.account_status;
  claimed_email text;
  email_is_verified boolean;
  account_name text;
  existing_volunteer_id uuid;
  candidate_id uuid;
  candidate_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select
    status,
    display_name,
    claimed_email_normalized,
    email_ownership_verified
  into
    current_status,
    account_name,
    claimed_email,
    email_is_verified
  from core.user_accounts
  where id = current_user_id;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    return 'account_inactive';
  end if;

  select id
  into existing_volunteer_id
  from core.volunteers
  where auth_user_id = current_user_id
  limit 1;

  if existing_volunteer_id is not null then
    update core.user_accounts
    set status = 'active'
    where id = current_user_id;

    if email_is_verified and claimed_email is not null then
      update core.volunteers
      set primary_email_normalized = claimed_email
      where id = existing_volunteer_id;

      update public.phaseone_roster
      set volunteer_id = existing_volunteer_id
      where volunteer_id is null
        and email_normalized = claimed_email;
    end if;

    if exists (
      select 1
      from core.volunteers volunteer
      where volunteer.id = existing_volunteer_id
        and (
          nullif(btrim(volunteer.primary_email_normalized), '') is not null
          or nullif(btrim(volunteer.mobile), '') is not null
        )
    ) then
      perform core.ensure_maklom_profile_extension(
        existing_volunteer_id,
        'keluarga_account'
      );
    end if;

    return 'already_linked';
  end if;

  if not coalesce(email_is_verified, false) then
    insert into core.volunteers(
      auth_user_id,
      display_name,
      primary_email_normalized
    )
    values (
      current_user_id,
      nullif(btrim(account_name), ''),
      null
    )
    returning id into existing_volunteer_id;

    update core.user_accounts
    set status = 'active'
    where id = current_user_id;

    return 'created_unverified';
  end if;

  if claimed_email is null then
    return 'email_unverified';
  end if;

  select count(*)::integer
  into candidate_count
  from core.volunteers
  where primary_email_normalized = claimed_email
    and auth_user_id is null
    and account_access_eligible;

  if candidate_count = 1 then
    select id
    into candidate_id
    from core.volunteers
    where primary_email_normalized = claimed_email
      and auth_user_id is null
      and account_access_eligible
    limit 1;

    update core.volunteers
    set auth_user_id = current_user_id
    where id = candidate_id
      and auth_user_id is null;

    if found then
      update core.user_accounts
      set
        status = 'active',
        display_name = coalesce(
          (
            select nullif(btrim(display_name), '')
            from core.volunteers
            where id = candidate_id
          ),
          display_name
        )
      where id = current_user_id;

      update public.phaseone_roster
      set volunteer_id = candidate_id
      where volunteer_id is null
        and email_normalized = claimed_email;

      perform core.ensure_maklom_profile_extension(
        candidate_id,
        'keluarga_account'
      );

      return 'linked_existing';
    end if;
  end if;

  if candidate_count > 1 then
    insert into core.account_link_cases(auth_user_id, status, reason_code)
    select current_user_id, 'needs_review', 'ambiguous_verified_email'
    where not exists (
      select 1
      from core.account_link_cases
      where auth_user_id = current_user_id
        and status in ('pending', 'needs_review')
    );

    return 'needs_review';
  end if;

  insert into core.volunteers(
    auth_user_id,
    display_name,
    primary_email_normalized
  )
  values (
    current_user_id,
    nullif(btrim(account_name), ''),
    claimed_email
  )
  returning id into existing_volunteer_id;

  update core.user_accounts
  set status = 'active'
  where id = current_user_id;

  update public.phaseone_roster
  set volunteer_id = existing_volunteer_id
  where volunteer_id is null
    and email_normalized = claimed_email;

  perform core.ensure_maklom_profile_extension(
    existing_volunteer_id,
    'keluarga_account'
  );

  return 'created';
end;
$$;

comment on function core.ensure_current_keluarga_volunteer() is
  'Ensures an authenticated account has one KELUARGA volunteer identity. Unverified claimed emails never auto-link historical volunteer or roster records.';

create or replace function core.update_current_volunteer_profile(
  p_display_name text,
  p_mobile text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  current_user_id uuid := auth.uid();
  volunteer_id uuid;
  clean_display_name text := nullif(btrim(p_display_name), '');
  clean_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  changed_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    raise exception 'An active KELUARGA account is required' using errcode = '42501';
  end if;

  if clean_display_name is null or char_length(clean_display_name) > 120 then
    raise exception 'Enter a valid full name' using errcode = '22023';
  end if;

  if clean_mobile is not null and (
    char_length(clean_mobile) < 7
    or char_length(clean_mobile) > 40
    or clean_mobile !~ '^[0-9+() .-]+$'
  ) then
    raise exception 'Enter a valid mobile number' using errcode = '22023';
  end if;

  select volunteers.id
  into volunteer_id
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  for update;

  if volunteer_id is null then
    raise exception 'Volunteer profile is unavailable' using errcode = 'P0002';
  end if;

  update core.user_accounts
  set display_name = clean_display_name
  where id = current_user_id;

  update core.volunteers
  set
    display_name = clean_display_name,
    mobile = clean_mobile
  where id = volunteer_id
  returning updated_at into changed_at;

  if clean_mobile is not null then
    perform core.ensure_maklom_profile_extension(
      volunteer_id,
      'keluarga_account'
    );
  end if;

  perform audit.write_event(
    'volunteer.profile_updated',
    'volunteer',
    volunteer_id::text,
    jsonb_build_object(
      'changed_fields',
      jsonb_build_array('display_name', 'mobile')
    ),
    current_user_id,
    null
  );

  return jsonb_build_object(
    'display_name', clean_display_name,
    'mobile', clean_mobile,
    'updated_at', changed_at
  );
end;
$$;

comment on function core.update_current_volunteer_profile(text, text) is
  'Updates the authenticated active volunteer name/mobile, creates the MakLom profile extension once a mobile exists, and records an audit event.';

commit;
