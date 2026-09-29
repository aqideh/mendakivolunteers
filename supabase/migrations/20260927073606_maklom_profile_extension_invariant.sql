begin;

alter table public.volunteers
  add column if not exists profile_origin text not null default 'legacy';

comment on column public.volunteers.profile_origin is
  'Origin of the MakLom profile extension. KELUARGA-native and manual-roster profiles remain linked to the same canonical core.volunteers UUID.';

create or replace function core.ensure_maklom_profile_extension(
  p_volunteer_id uuid,
  p_origin text default 'keluarga_native'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_email text;
  v_mobile text;
  v_code text;
  v_profile_id text;
begin
  if p_volunteer_id is null then
    raise exception 'Volunteer ID is required' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_volunteer_id::text, 0)
  );

  if exists (
    select 1
    from public.volunteers profile
    where profile.core_volunteer_id = p_volunteer_id
  ) then
    return 'already_exists';
  end if;

  select
    nullif(btrim(volunteer.display_name), ''),
    nullif(lower(btrim(volunteer.primary_email_normalized)), ''),
    nullif(btrim(volunteer.mobile), ''),
    volunteer.volunteer_code
  into v_name, v_email, v_mobile, v_code
  from core.volunteers volunteer
  where volunteer.id = p_volunteer_id;

  if not found then
    raise exception 'Canonical volunteer does not exist' using errcode = 'P0002';
  end if;

  if v_email is null and v_mobile is null then
    raise exception 'MakLom profile requires volunteer email or mobile'
      using errcode = '22023';
  end if;

  v_profile_id := 'vol_' || substr(replace(pg_catalog.gen_random_uuid()::text, '-', ''), 1, 20);

  insert into public.volunteers (
    id,
    core_volunteer_id,
    name,
    phone,
    email,
    profile_origin
  )
  values (
    v_profile_id,
    p_volunteer_id,
    coalesce(v_name, v_code),
    v_mobile,
    v_email,
    coalesce(nullif(btrim(p_origin), ''), 'keluarga_native')
  );

  return 'created';
end;
$$;

revoke all on function core.ensure_maklom_profile_extension(uuid, text)
  from public, anon, authenticated;

create or replace function core.ensure_current_keluarga_volunteer()
returns text
language plpgsql
security definer
set search_path = 'pg_catalog', 'core', 'auth', 'audit'
as $$
declare
  current_user_id uuid := auth.uid();
  current_status core.account_status;
  verified_email text;
  account_name text;
  existing_volunteer_id uuid;
  candidate_id uuid;
  candidate_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select status, display_name
  into current_status, account_name
  from core.user_accounts
  where id = current_user_id;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    return 'account_inactive';
  end if;

  select lower(btrim(email))
  into verified_email
  from auth.users
  where id = current_user_id
    and email is not null
    and coalesce(email_confirmed_at, confirmed_at) is not null;

  if verified_email is null then
    return 'email_unverified';
  end if;

  select id
  into existing_volunteer_id
  from core.volunteers
  where auth_user_id = current_user_id
  limit 1;

  if existing_volunteer_id is not null then
    update core.volunteers
    set primary_email_normalized = verified_email
    where id = existing_volunteer_id;

    update core.user_accounts
    set status = 'active'
    where id = current_user_id;

    update public.phaseone_roster
    set volunteer_id = existing_volunteer_id
    where volunteer_id is null
      and email_normalized = verified_email;

    perform core.ensure_maklom_profile_extension(
      existing_volunteer_id,
      'keluarga_account'
    );

    return 'already_linked';
  end if;

  select count(*)::integer
  into candidate_count
  from core.volunteers
  where primary_email_normalized = verified_email
    and auth_user_id is null
    and account_access_eligible;

  if candidate_count = 1 then
    select id
    into candidate_id
    from core.volunteers
    where primary_email_normalized = verified_email
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
        and email_normalized = verified_email;

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
    verified_email
  )
  returning id into existing_volunteer_id;

  update core.user_accounts
  set status = 'active'
  where id = current_user_id;

  update public.phaseone_roster
  set volunteer_id = existing_volunteer_id
  where volunteer_id is null
    and email_normalized = verified_email;

  perform core.ensure_maklom_profile_extension(
    existing_volunteer_id,
    'keluarga_account'
  );

  return 'created';
end;
$$;

create or replace function core.resolve_manual_roster_volunteer(
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint
)
returns jsonb
language plpgsql
security definer
set search_path = 'pg_catalog', 'core', 'public'
as $$
declare
  normalized_key text := upper(nullif(btrim(coalesce(p_volunteer_key, '')), ''));
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  normalized_mobile text := public.phaseone_canonical_mobile(p_mobile);
  key_volunteer_id uuid;
  matched_ids uuid[];
  matched_volunteer_id uuid;
  volunteer_code text;
  created boolean := false;
begin
  if p_volunteer_name is null or char_length(btrim(p_volunteer_name)) < 1 then
    raise exception 'Volunteer name is required' using errcode = '22023';
  end if;
  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120' using errcode = '22023';
  end if;

  if normalized_key ~ '^KEL[0-9]{5}$' then
    select id into key_volunteer_id
    from core.volunteers
    where volunteer_code = normalized_key;

    if key_volunteer_id is null then
      raise exception 'KELUARGA volunteer ID does not exist: %', normalized_key
        using errcode = 'P0002';
    end if;
  end if;

  select array_agg(distinct candidate.id order by candidate.id)
  into matched_ids
  from core.volunteers candidate
  where (normalized_email is not null and candidate.primary_email_normalized = normalized_email)
     or (
       normalized_mobile is not null
       and public.phaseone_canonical_mobile(candidate.mobile) = normalized_mobile
     );

  if coalesce(array_length(matched_ids, 1), 0) > 1 then
    raise exception 'Volunteer identifiers match multiple KELUARGA volunteer records'
      using errcode = 'P0001';
  end if;

  if coalesce(array_length(matched_ids, 1), 0) = 1 then
    matched_volunteer_id := matched_ids[1];
  end if;

  if key_volunteer_id is not null
     and matched_volunteer_id is not null
     and key_volunteer_id <> matched_volunteer_id then
    raise exception 'Volunteer ID, email or mobile point to different KELUARGA volunteers'
      using errcode = 'P0001';
  end if;

  matched_volunteer_id := coalesce(key_volunteer_id, matched_volunteer_id);

  if matched_volunteer_id is null then
    if normalized_email is null and normalized_mobile is null then
      raise exception 'Integrated roster rows need an existing KELUARGA volunteer ID, email or mobile number'
        using errcode = '22023';
    end if;

    insert into core.volunteers(
      display_name,
      primary_email_normalized,
      mobile,
      age
    )
    values (
      btrim(p_volunteer_name),
      normalized_email,
      nullif(btrim(p_mobile), ''),
      p_age
    )
    returning id into matched_volunteer_id;

    created := true;
  else
    update core.volunteers
    set
      display_name = coalesce(nullif(btrim(display_name), ''), btrim(p_volunteer_name)),
      primary_email_normalized = coalesce(primary_email_normalized, normalized_email),
      mobile = coalesce(mobile, nullif(btrim(p_mobile), '')),
      age = coalesce(age, p_age),
      updated_at = now()
    where id = matched_volunteer_id;
  end if;

  perform core.ensure_maklom_profile_extension(
    matched_volunteer_id,
    'keluarga_manual_roster'
  );

  select v.volunteer_code into volunteer_code
  from core.volunteers v
  where v.id = matched_volunteer_id;

  return jsonb_build_object(
    'volunteer_id', matched_volunteer_id,
    'volunteer_code', volunteer_code,
    'created', created
  );
end;
$$;

do $$
declare
  v_record record;
begin
  for v_record in
    select
      volunteer.id,
      case
        when volunteer.auth_user_id is not null then 'keluarga_account'
        else 'keluarga_manual_roster'
      end as origin
    from core.volunteers volunteer
    where not exists (
      select 1
      from public.volunteers profile
      where profile.core_volunteer_id = volunteer.id
    )
      and (
        volunteer.auth_user_id is not null
        or exists (
          select 1
          from public.phaseone_roster roster
          where roster.volunteer_id = volunteer.id
        )
      )
      and coalesce(
        nullif(btrim(volunteer.primary_email_normalized), ''),
        nullif(btrim(volunteer.mobile), '')
      ) is not null
  loop
    perform core.ensure_maklom_profile_extension(
      v_record.id,
      v_record.origin
    );
  end loop;
end;
$$;

commit;