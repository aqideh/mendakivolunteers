begin;

create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  claimed_email text := case
    when new.email is null then null
    else lower(btrim(new.email))
  end;
  email_is_verified boolean :=
    new.email is not null
    and new.email_confirmed_at is not null
    and coalesce(
      new.raw_app_meta_data ->> 'keluarga_email_ownership_verified',
      'true'
    ) <> 'false';
begin
  insert into core.user_accounts (
    id,
    display_name,
    claimed_email_normalized,
    email_ownership_verified,
    email_ownership_verified_at
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    claimed_email,
    email_is_verified,
    case when email_is_verified then coalesce(new.email_confirmed_at, now()) end
  )
  on conflict (id) do update
  set
    claimed_email_normalized = coalesce(
      excluded.claimed_email_normalized,
      core.user_accounts.claimed_email_normalized
    ),
    email_ownership_verified = (
      core.user_accounts.email_ownership_verified
      or excluded.email_ownership_verified
    ),
    email_ownership_verified_at = case
      when core.user_accounts.email_ownership_verified_at is not null
        then core.user_accounts.email_ownership_verified_at
      when excluded.email_ownership_verified
        then excluded.email_ownership_verified_at
      else null
    end;

  insert into core.user_roles (user_id, role, reason)
  values (new.id, 'volunteer', 'Default role assigned at account creation')
  on conflict (user_id, role) do nothing;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object(
      'default_role', 'volunteer',
      'email_ownership_verified', email_is_verified
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
  stored_email_verified boolean;
  auth_email text;
  auth_email_confirmed_at timestamptz;
  explicit_unverified boolean;
  account_name text;
  existing_volunteer_id uuid;
  candidate_id uuid;
  candidate_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select
    account.status,
    account.display_name,
    account.claimed_email_normalized,
    account.email_ownership_verified,
    lower(btrim(auth_user.email)),
    auth_user.email_confirmed_at,
    coalesce(
      auth_user.raw_app_meta_data ->> 'keluarga_email_ownership_verified',
      'true'
    ) = 'false'
  into
    current_status,
    account_name,
    claimed_email,
    stored_email_verified,
    auth_email,
    auth_email_confirmed_at,
    explicit_unverified
  from core.user_accounts account
  join auth.users auth_user on auth_user.id = account.id
  where account.id = current_user_id;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    return 'account_inactive';
  end if;

  email_is_verified :=
    coalesce(stored_email_verified, false)
    or (
      auth_email_confirmed_at is not null
      and not coalesce(explicit_unverified, false)
    );

  if email_is_verified and auth_email is not null then
    claimed_email := auth_email;

    if not coalesce(stored_email_verified, false) then
      update core.user_accounts
      set
        claimed_email_normalized = auth_email,
        email_ownership_verified = true,
        email_ownership_verified_at = coalesce(
          email_ownership_verified_at,
          auth_email_confirmed_at,
          now()
        )
      where id = current_user_id;
    end if;
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
  'Ensures an authenticated account has one KELUARGA volunteer identity. Explicitly unverified temporary password accounts never auto-link by email; genuinely Supabase-verified accounts retain verified identity behavior.';

commit;
