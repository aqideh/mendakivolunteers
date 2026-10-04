begin;

alter table core.account_link_cases
  drop constraint if exists account_link_cases_review_outcome_check;

alter table core.account_link_cases
  add constraint account_link_cases_review_outcome_check check (
    review_outcome is null
    or review_outcome in (
      'approved_new',
      'matched_existing_deferred',
      'refill_required',
      'merged_existing'
    )
  );

create or replace function core.merge_reconciled_volunteer_identity(
  p_case_id uuid,
  p_candidate_volunteer_id uuid,
  p_active_login text,
  p_actor_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, auth, public, audit
as $$
declare
  v_case core.account_link_cases%rowtype;
  v_source core.volunteers%rowtype;
  v_target core.volunteers%rowtype;
  v_source_profile_id text;
  v_target_profile_id text;
  v_target_auth_user_id uuid;
  v_active_auth_user_id uuid;
  v_retired_auth_user_id uuid;
  v_active_email text;
  v_source_code text;
  v_has_historical_attendance boolean := false;
begin
  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in ('admin', 'volteam')
  ) then
    raise exception 'Volunteer reconciliation manager authorization is required'
      using errcode = '42501';
  end if;

  if p_active_login not in ('current', 'existing') then
    raise exception 'Choose which verified login should remain active'
      using errcode = '22023';
  end if;

  select *
  into v_case
  from core.account_link_cases
  where id = p_case_id
  for update;

  if not found
     or v_case.status not in ('pending', 'needs_review')
     or v_case.reason_code not in ('verified_name_mobile_match', 'ambiguous_name_mobile_match') then
    raise exception 'This reconciliation case is not eligible for identity merge'
      using errcode = 'P0001';
  end if;

  select *
  into v_source
  from core.volunteers
  where auth_user_id = v_case.auth_user_id
  for update;

  if not found then
    raise exception 'Current volunteer identity is unavailable'
      using errcode = 'P0002';
  end if;

  select *
  into v_target
  from core.volunteers
  where id = p_candidate_volunteer_id
  for update;

  if not found or v_target.id = v_source.id then
    raise exception 'Choose a different existing volunteer record'
      using errcode = '22023';
  end if;

  if regexp_replace(lower(coalesce(v_source.display_name, '')), '[^a-z0-9]+', '', 'g')
       <> regexp_replace(lower(coalesce(v_target.display_name, '')), '[^a-z0-9]+', '', 'g')
     or regexp_replace(coalesce(v_source.mobile, ''), '\D', '', 'g')
       <> regexp_replace(coalesce(v_target.mobile, ''), '\D', '', 'g')
     or regexp_replace(coalesce(v_source.mobile, ''), '\D', '', 'g') = '' then
    raise exception 'The selected records do not have the required exact name and mobile match'
      using errcode = 'P0001';
  end if;

  if v_source.primary_email_normalized is not null
     and v_target.primary_email_normalized is not null
     and lower(v_source.primary_email_normalized) = lower(v_target.primary_email_normalized) then
    raise exception 'These records already use the same email; use the normal email-linking workflow'
      using errcode = 'P0001';
  end if;

  v_target_auth_user_id := v_target.auth_user_id;

  if p_active_login = 'existing' then
    if v_target_auth_user_id is null then
      raise exception 'The existing volunteer record does not have a login to keep'
        using errcode = 'P0001';
    end if;
    v_active_auth_user_id := v_target_auth_user_id;
    v_retired_auth_user_id := v_case.auth_user_id;
  else
    v_active_auth_user_id := v_case.auth_user_id;
    v_retired_auth_user_id := v_target_auth_user_id;
  end if;

  select lower(btrim(email))
  into v_active_email
  from auth.users
  where id = v_active_auth_user_id
    and email_confirmed_at is not null;

  if v_active_email is null then
    raise exception 'The selected active login does not have a verified email'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.phaseone_roster where volunteer_id = v_source.id
    union all
    select 1 from public.keluarga_registrations where volunteer_id = v_source.id
    union all
    select 1 from public.volunteer_contributions where volunteer_id = v_source.id
    union all
    select 1 from public.keluarga_contribution_credits where volunteer_id = v_source.id
    union all
    select 1 from public.keluarga_notifications where volunteer_id = v_source.id
    union all
    select 1 from public.keluarga_recruitment_applications where volunteer_id = v_source.id
    union all
    select 1 from public.volunteer_leads where keluarga_volunteer_id = v_source.id
    union all
    select 1 from public.volunteer_shirt_issuances where volunteer_id = v_source.id
    union all
    select 1 from gamification.point_ledger_entries where volunteer_id = v_source.id
    union all
    select 1 from gamification.volunteer_badges where volunteer_id = v_source.id
    union all
    select 1 from pathways.volunteer_positions where volunteer_id = v_source.id
    union all
    select 1 from ymhub.assignment_snapshots where volunteer_id = v_source.id
    union all
    select 1 from ymhub.attendance_snapshots where volunteer_id = v_source.id
    union all
    select 1 from ymhub.registration_snapshots where volunteer_id = v_source.id
    union all
    select 1 from ymhub.volunteer_sync_status where volunteer_id = v_source.id
  ) then
    raise exception 'The newer volunteer record has acquired activity and requires manual reconciliation'
      using errcode = 'P0001';
  end if;

  select id
  into v_source_profile_id
  from public.volunteers
  where core_volunteer_id = v_source.id;

  select id
  into v_target_profile_id
  from public.volunteers
  where core_volunteer_id = v_target.id;

  if v_source_profile_id is null or v_target_profile_id is null then
    raise exception 'Both volunteer records must have MakLom profile extensions'
      using errcode = 'P0001';
  end if;

  if to_regclass('public.historical_attendance_import_rows') is not null then
    execute
      'select exists (
         select 1
         from public.historical_attendance_import_rows
         where matched_volunteer_id = $1
       )'
    into v_has_historical_attendance
    using v_source_profile_id;
  end if;

  if v_has_historical_attendance or exists (
    select 1 from public.attendance_log where volunteer_id = v_source_profile_id
    union all
    select 1 from public.attendance_reconciliations where volunteer_id = v_source_profile_id
    union all
    select 1 from public.suspected_duplicates where existing_volunteer_id = v_source_profile_id
    union all
    select 1 from public.volunteer_leads where converted_volunteer_id = v_source_profile_id
  ) then
    raise exception 'The newer MakLom profile has acquired activity and requires manual reconciliation'
      using errcode = 'P0001';
  end if;

  insert into public.keluarga_volunteer_profiles (
    volunteer_id,
    avatar_path,
    bio,
    interests,
    skills,
    availability_notes,
    created_at,
    updated_at,
    availability_slots,
    preferred_commitment,
    onboarding_completed_at,
    event_card_photo_opt_in
  )
  select
    v_target.id,
    case when p_active_login = 'current' then source.avatar_path else null end,
    source.bio,
    source.interests,
    source.skills,
    source.availability_notes,
    source.created_at,
    now(),
    source.availability_slots,
    source.preferred_commitment,
    source.onboarding_completed_at,
    source.event_card_photo_opt_in
  from public.keluarga_volunteer_profiles source
  where source.volunteer_id = v_source.id
  on conflict (volunteer_id) do update
  set
    avatar_path = case
      when p_active_login = 'current'
        then coalesce(excluded.avatar_path, public.keluarga_volunteer_profiles.avatar_path)
      else public.keluarga_volunteer_profiles.avatar_path
    end,
    bio = coalesce(excluded.bio, public.keluarga_volunteer_profiles.bio),
    interests = case
      when cardinality(excluded.interests) > 0 then excluded.interests
      else public.keluarga_volunteer_profiles.interests
    end,
    skills = case
      when cardinality(excluded.skills) > 0 then excluded.skills
      else public.keluarga_volunteer_profiles.skills
    end,
    availability_notes = coalesce(
      excluded.availability_notes,
      public.keluarga_volunteer_profiles.availability_notes
    ),
    availability_slots = case
      when cardinality(excluded.availability_slots) > 0 then excluded.availability_slots
      else public.keluarga_volunteer_profiles.availability_slots
    end,
    preferred_commitment = coalesce(
      excluded.preferred_commitment,
      public.keluarga_volunteer_profiles.preferred_commitment
    ),
    onboarding_completed_at = coalesce(
      excluded.onboarding_completed_at,
      public.keluarga_volunteer_profiles.onboarding_completed_at
    ),
    event_card_photo_opt_in = excluded.event_card_photo_opt_in,
    created_at = least(
      excluded.created_at,
      public.keluarga_volunteer_profiles.created_at
    ),
    updated_at = now();

  insert into public.volunteer_private_details (
    volunteer_id,
    date_of_birth,
    postal_code,
    address_line,
    latitude,
    longitude,
    neighbourhood,
    planning_area,
    electoral_division,
    electoral_boundary_version,
    address_verified_at,
    dietary_requirements,
    food_allergies,
    no_known_food_allergies,
    tshirt_size,
    highest_qualification,
    institution,
    field_of_study,
    languages_spoken,
    emergency_contact_name,
    emergency_contact_mobile,
    created_at,
    updated_at,
    electoral_division_code
  )
  select
    v_target.id,
    source.date_of_birth,
    source.postal_code,
    source.address_line,
    source.latitude,
    source.longitude,
    source.neighbourhood,
    source.planning_area,
    source.electoral_division,
    source.electoral_boundary_version,
    source.address_verified_at,
    source.dietary_requirements,
    source.food_allergies,
    source.no_known_food_allergies,
    source.tshirt_size,
    source.highest_qualification,
    source.institution,
    source.field_of_study,
    source.languages_spoken,
    source.emergency_contact_name,
    source.emergency_contact_mobile,
    source.created_at,
    now(),
    source.electoral_division_code
  from public.volunteer_private_details source
  where source.volunteer_id = v_source.id
  on conflict (volunteer_id) do update
  set
    date_of_birth = coalesce(excluded.date_of_birth, public.volunteer_private_details.date_of_birth),
    postal_code = coalesce(excluded.postal_code, public.volunteer_private_details.postal_code),
    address_line = coalesce(excluded.address_line, public.volunteer_private_details.address_line),
    latitude = coalesce(excluded.latitude, public.volunteer_private_details.latitude),
    longitude = coalesce(excluded.longitude, public.volunteer_private_details.longitude),
    neighbourhood = coalesce(excluded.neighbourhood, public.volunteer_private_details.neighbourhood),
    planning_area = coalesce(excluded.planning_area, public.volunteer_private_details.planning_area),
    electoral_division = coalesce(excluded.electoral_division, public.volunteer_private_details.electoral_division),
    electoral_boundary_version = coalesce(
      excluded.electoral_boundary_version,
      public.volunteer_private_details.electoral_boundary_version
    ),
    address_verified_at = coalesce(excluded.address_verified_at, public.volunteer_private_details.address_verified_at),
    dietary_requirements = coalesce(excluded.dietary_requirements, public.volunteer_private_details.dietary_requirements),
    food_allergies = excluded.food_allergies,
    no_known_food_allergies = excluded.no_known_food_allergies,
    tshirt_size = coalesce(excluded.tshirt_size, public.volunteer_private_details.tshirt_size),
    highest_qualification = coalesce(excluded.highest_qualification, public.volunteer_private_details.highest_qualification),
    institution = coalesce(excluded.institution, public.volunteer_private_details.institution),
    field_of_study = coalesce(excluded.field_of_study, public.volunteer_private_details.field_of_study),
    languages_spoken = case
      when cardinality(excluded.languages_spoken) > 0 then excluded.languages_spoken
      else public.volunteer_private_details.languages_spoken
    end,
    emergency_contact_name = coalesce(
      excluded.emergency_contact_name,
      public.volunteer_private_details.emergency_contact_name
    ),
    emergency_contact_mobile = coalesce(
      excluded.emergency_contact_mobile,
      public.volunteer_private_details.emergency_contact_mobile
    ),
    electoral_division_code = coalesce(
      excluded.electoral_division_code,
      public.volunteer_private_details.electoral_division_code
    ),
    created_at = least(excluded.created_at, public.volunteer_private_details.created_at),
    updated_at = now();

  delete from public.keluarga_volunteer_profiles where volunteer_id = v_source.id;
  delete from public.volunteer_private_details where volunteer_id = v_source.id;

  update public.volunteer_profile_change_inbox
  set volunteer_id = v_target.id
  where volunteer_id = v_source.id;

  update core.account_link_cases
  set candidate_volunteer_id = v_target.id
  where candidate_volunteer_id = v_source.id;

  update core.volunteer_aliases
  set volunteer_id = v_target.id
  where volunteer_id = v_source.id;

  v_source_code := v_source.volunteer_code;

  insert into core.volunteer_aliases (
    volunteer_id,
    source_system,
    source_id,
    created_by
  )
  values (
    v_target.id,
    'keluarga_merged_code',
    v_source_code,
    p_actor_user_id
  )
  on conflict (source_system, source_id) do update
  set
    volunteer_id = excluded.volunteer_id,
    created_by = excluded.created_by;

  update core.volunteers
  set auth_user_id = null
  where id in (v_source.id, v_target.id);

  if v_retired_auth_user_id is not null
     and v_retired_auth_user_id <> v_active_auth_user_id then
    update core.user_accounts
    set status = 'closed',
        updated_at = now()
    where id = v_retired_auth_user_id;
  end if;

  update core.user_accounts
  set status = 'active',
      claimed_email_normalized = v_active_email,
      email_ownership_verified = true,
      updated_at = now()
  where id = v_active_auth_user_id;

  update core.volunteers
  set
    auth_user_id = v_active_auth_user_id,
    primary_email_normalized = v_active_email,
    display_name = coalesce(nullif(btrim(v_source.display_name), ''), display_name),
    mobile = coalesce(nullif(btrim(v_source.mobile), ''), mobile),
    updated_at = now()
  where id = v_target.id;

  update public.volunteers target_profile
  set
    nric = coalesce(target_profile.nric, source_profile.nric),
    gender = coalesce(target_profile.gender, source_profile.gender),
    address = coalesce(source_profile.address, target_profile.address),
    interests = coalesce(source_profile.interests, target_profile.interests),
    languages_spoken = coalesce(source_profile.languages_spoken, target_profile.languages_spoken),
    emergency_name = coalesce(source_profile.emergency_name, target_profile.emergency_name),
    emergency_phone = coalesce(source_profile.emergency_phone, target_profile.emergency_phone),
    shirt_size = coalesce(source_profile.shirt_size, target_profile.shirt_size),
    dietary = coalesce(source_profile.dietary, target_profile.dietary),
    neighbourhood = coalesce(source_profile.neighbourhood, target_profile.neighbourhood),
    planning_area = coalesce(source_profile.planning_area, target_profile.planning_area),
    electoral_division = coalesce(source_profile.electoral_division, target_profile.electoral_division),
    notes = case
      when nullif(btrim(source_profile.notes), '') is null then target_profile.notes
      when nullif(btrim(target_profile.notes), '') is null then source_profile.notes
      else target_profile.notes || E'\n[Merged duplicate profile] ' || source_profile.notes
    end,
    updated_at = now()
  from public.volunteers source_profile
  where target_profile.core_volunteer_id = v_target.id
    and source_profile.core_volunteer_id = v_source.id;

  update public.volunteers
  set
    name = coalesce(nullif(btrim(v_source.display_name), ''), name),
    email = v_active_email,
    phone = coalesce(nullif(btrim(v_source.mobile), ''), phone),
    updated_at = now()
  where core_volunteer_id = v_target.id;

  update public.phaseone_roster
  set
    email = v_active_email,
    mobile = coalesce(nullif(btrim(v_source.mobile), ''), mobile)
  where volunteer_id = v_target.id;

  delete from public.volunteers
  where core_volunteer_id = v_source.id;

  delete from core.volunteers
  where id = v_source.id;

  update core.account_link_cases
  set
    status = 'resolved',
    reason_code = 'identity_merged',
    review_outcome = 'merged_existing',
    candidate_volunteer_id = v_target.id,
    requested_sections = '{}'::text[],
    volunteer_message = null,
    resolution_notes = nullif(btrim(coalesce(p_notes, '')), ''),
    resolved_by = p_actor_user_id,
    resolved_at = now()
  where id = p_case_id;

  perform audit.write_event(
    'volunteer.identity_reconciled',
    'volunteer',
    v_target.id::text,
    jsonb_build_object(
      'case_id', p_case_id,
      'retained_volunteer_code', v_target.volunteer_code,
      'retired_volunteer_code', v_source_code,
      'active_login', p_active_login,
      'active_email', v_active_email,
      'retired_auth_user_id', v_retired_auth_user_id
    ),
    p_actor_user_id,
    null
  );

  return jsonb_build_object(
    'volunteer_id', v_target.id,
    'volunteer_code', v_target.volunteer_code,
    'retired_volunteer_code', v_source_code,
    'active_email', v_active_email,
    'active_login', p_active_login
  );
end;
$$;

revoke all on function core.merge_reconciled_volunteer_identity(
  uuid,
  uuid,
  text,
  uuid,
  text
) from public, anon, authenticated;

grant execute on function core.merge_reconciled_volunteer_identity(
  uuid,
  uuid,
  text,
  uuid,
  text
) to service_role;

comment on function core.merge_reconciled_volunteer_identity(uuid, uuid, text, uuid, text) is
  'Merges a verified changed-email duplicate into an existing canonical volunteer after VolTeam/admin review. The existing volunteer record survives; staff choose which verified login remains active.';

commit;
