begin;

create or replace function core.resolve_volunteer_code_alias(p_code text)
returns uuid
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(
    (
      select volunteer.id
      from core.volunteers volunteer
      where volunteer.volunteer_code = upper(btrim(p_code))
      limit 1
    ),
    (
      select alias.volunteer_id
      from core.volunteer_aliases alias
      where alias.source_system = 'keluarga_merged_code'
        and alias.source_id = upper(btrim(p_code))
      limit 1
    )
  );
$$;

revoke all on function core.resolve_volunteer_code_alias(text)
  from public, anon, authenticated, service_role;

create or replace function public.phaseone_relink_roster_volunteer(
  p_event_id uuid,
  p_roster_id uuid,
  p_target_volunteer_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_scope text;
  v_source_volunteer_id uuid;
  v_source_code text;
  v_source_auth_user_id uuid;
  v_source_ymhub_id text;
  v_source_link_status text;
  v_target_code text;
  v_target_name text;
  v_attendance_person_key text;
  v_assignment_count integer := 0;
  v_source_profile_origin text;
  v_source_profile_id text;
  v_target_profile_id text;
  v_source_profile_has_extra boolean := false;
  v_private_has_extra boolean := false;
  v_has_blocking_history boolean := false;
  v_source_retired boolean := false;
begin
  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in ('volteam', 'admin')
  ) then
    raise exception 'Volunteer Team or admin access is required'
      using errcode = '42501';
  end if;

  if p_event_id is null or p_roster_id is null or p_target_volunteer_id is null then
    raise exception 'Event, roster and target volunteer are required'
      using errcode = '22023';
  end if;

  select event.operations_scope
  into v_scope
  from public.phaseone_events event
  where event.id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if v_scope = 'manual_isolated' then
    raise exception 'This isolated event cannot link to the shared volunteer database'
      using errcode = 'P0001';
  end if;

  select
    roster.volunteer_id,
    roster.volunteer_link_status,
    roster.attendance_person_key
  into
    v_source_volunteer_id,
    v_source_link_status,
    v_attendance_person_key
  from public.phaseone_roster roster
  where roster.id = p_roster_id
    and roster.event_id = p_event_id
  for update;

  if not found then
    raise exception 'Roster entry not found' using errcode = 'P0002';
  end if;

  select volunteer.volunteer_code, volunteer.display_name
  into v_target_code, v_target_name
  from core.volunteers volunteer
  where volunteer.id = p_target_volunteer_id
  for update;

  if not found then
    raise exception 'Target volunteer does not exist' using errcode = 'P0002';
  end if;

  if v_source_volunteer_id = p_target_volunteer_id then
    update public.phaseone_roster
    set
      volunteer_key = v_target_code,
      attendance_person_key = 'id:' || lower(v_target_code),
      volunteer_link_status = 'matched_existing',
      volunteer_link_note = 'Identity confirmed manually against the volunteer database.'
    where id = p_roster_id;

    return jsonb_build_object(
      'target_volunteer_id', p_target_volunteer_id,
      'target_volunteer_code', v_target_code,
      'target_display_name', v_target_name,
      'assignments_updated', 1,
      'source_duplicate_retired', false,
      'already_linked', true
    );
  end if;

  if v_source_volunteer_id is not null then
    select
      volunteer.volunteer_code,
      volunteer.auth_user_id,
      volunteer.ymhub_volunteer_id
    into
      v_source_code,
      v_source_auth_user_id,
      v_source_ymhub_id
    from core.volunteers volunteer
    where volunteer.id = v_source_volunteer_id
    for update;
  end if;

  if exists (
    select 1
    from public.phaseone_roster candidate
    where candidate.event_id = p_event_id
      and candidate.id <> p_roster_id
      and candidate.timeslot_id in (
        select source_row.timeslot_id
        from public.phaseone_roster source_row
        where source_row.event_id = p_event_id
          and (
            (v_source_volunteer_id is not null and source_row.volunteer_id = v_source_volunteer_id)
            or (
              v_source_volunteer_id is null
              and source_row.attendance_person_key = v_attendance_person_key
            )
          )
      )
      and (
        candidate.volunteer_id = p_target_volunteer_id
        or lower(btrim(candidate.volunteer_key)) = lower(v_target_code)
        or candidate.attendance_person_key = 'id:' || lower(v_target_code)
      )
  ) then
    raise exception 'The selected volunteer is already assigned to one of these event shifts'
      using errcode = '23505';
  end if;

  update public.phaseone_roster roster
  set
    volunteer_id = p_target_volunteer_id,
    volunteer_key = v_target_code,
    attendance_person_key = 'id:' || lower(v_target_code),
    volunteer_link_status = 'matched_existing',
    volunteer_link_note = left(
      'Manually linked to existing volunteer ' || v_target_code || '.',
      500
    ),
    source_assignment_status = 'staff_identity_relinked'
  where roster.event_id = p_event_id
    and (
      roster.id = p_roster_id
      or (
        v_source_volunteer_id is not null
        and roster.volunteer_id = v_source_volunteer_id
      )
      or (
        v_source_volunteer_id is null
        and roster.attendance_person_key = v_attendance_person_key
      )
    );

  get diagnostics v_assignment_count = row_count;

  if v_source_volunteer_id is not null
     and v_source_volunteer_id <> p_target_volunteer_id
     and v_source_link_status = 'created_new'
     and v_source_auth_user_id is null
     and v_source_ymhub_id is null then

    select profile.id, profile.profile_origin
    into v_source_profile_id, v_source_profile_origin
    from public.volunteers profile
    where profile.core_volunteer_id = v_source_volunteer_id;

    if v_source_profile_id is not null
       and v_source_profile_origin in ('keluarga_roster_import', 'keluarga_manual_roster') then

      select exists (
        select 1
        from public.volunteers profile
        where profile.core_volunteer_id = v_source_volunteer_id
          and (
            nullif(btrim(profile.nric), '') is not null
            or nullif(btrim(profile.gender), '') is not null
            or nullif(btrim(profile.address), '') is not null
            or profile.recruited_year is not null
            or nullif(btrim(profile.chat_session), '') is not null
            or profile.chat_session_date is not null
            or nullif(btrim(profile.interests), '') is not null
            or nullif(btrim(profile.languages_spoken), '') is not null
            or cardinality(profile.programmes_registered) > 0
            or cardinality(profile.tags) > 0
            or nullif(btrim(profile.emergency_name), '') is not null
            or nullif(btrim(profile.emergency_phone), '') is not null
            or nullif(btrim(profile.shirt_size), '') is not null
            or nullif(btrim(profile.dietary), '') is not null
            or nullif(btrim(profile.notes), '') is not null
            or profile.legacy_maklom_id is not null
          )
      )
      into v_source_profile_has_extra;

      select exists (
        select 1
        from public.volunteer_private_details details
        where details.volunteer_id = v_source_volunteer_id
          and (
            details.date_of_birth is not null
            or nullif(btrim(details.postal_code), '') is not null
            or nullif(btrim(details.address_line), '') is not null
            or details.latitude is not null
            or details.longitude is not null
            or nullif(btrim(details.neighbourhood), '') is not null
            or nullif(btrim(details.planning_area), '') is not null
            or nullif(btrim(details.electoral_division), '') is not null
            or nullif(btrim(details.electoral_boundary_version), '') is not null
            or details.address_verified_at is not null
            or nullif(btrim(details.food_allergies), '') is not null
            or details.no_known_food_allergies
            or nullif(btrim(details.highest_qualification), '') is not null
            or nullif(btrim(details.institution), '') is not null
            or nullif(btrim(details.field_of_study), '') is not null
            or cardinality(details.languages_spoken) > 0
            or nullif(btrim(details.emergency_contact_name), '') is not null
            or nullif(btrim(details.emergency_contact_mobile), '') is not null
            or nullif(btrim(details.electoral_division_code), '') is not null
          )
      )
      into v_private_has_extra;

      select (
        exists (select 1 from public.phaseone_roster where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from core.account_link_cases where candidate_volunteer_id = v_source_volunteer_id)
        or exists (select 1 from gamification.point_ledger_entries where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from gamification.volunteer_badges where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from pathways.volunteer_positions where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.historical_attendance_import_rows where matched_core_volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.keluarga_contribution_credits where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.keluarga_notifications where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.keluarga_recruitment_applications where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.keluarga_registrations where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.keluarga_volunteer_profiles where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.maklom_profile_inbox where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.volunteer_contributions where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.volunteer_leads where keluarga_volunteer_id = v_source_volunteer_id)
        or exists (select 1 from public.volunteer_profile_change_inbox where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from ymhub.assignment_snapshots where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from ymhub.attendance_snapshots where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from ymhub.registration_snapshots where volunteer_id = v_source_volunteer_id)
        or exists (select 1 from ymhub.volunteer_sync_status where volunteer_id = v_source_volunteer_id)
      )
      into v_has_blocking_history;

      if not v_source_profile_has_extra
         and not v_private_has_extra
         and not v_has_blocking_history then

        insert into public.volunteer_private_details (
          volunteer_id,
          tshirt_size,
          dietary_requirements
        )
        select
          p_target_volunteer_id,
          details.tshirt_size,
          details.dietary_requirements
        from public.volunteer_private_details details
        where details.volunteer_id = v_source_volunteer_id
        on conflict (volunteer_id) do update
        set
          tshirt_size = coalesce(
            public.volunteer_private_details.tshirt_size,
            excluded.tshirt_size
          ),
          dietary_requirements = coalesce(
            public.volunteer_private_details.dietary_requirements,
            excluded.dietary_requirements
          ),
          updated_at = now();

        delete from public.volunteer_private_details
        where volunteer_id = v_source_volunteer_id;

        update public.volunteer_shirt_issuances
        set volunteer_id = p_target_volunteer_id
        where volunteer_id = v_source_volunteer_id;

        update core.volunteer_aliases
        set volunteer_id = p_target_volunteer_id
        where volunteer_id = v_source_volunteer_id;

        if v_source_code is not null then
          insert into core.volunteer_aliases (
            volunteer_id,
            source_system,
            source_id,
            created_by
          )
          values (
            p_target_volunteer_id,
            'keluarga_merged_code',
            upper(v_source_code),
            p_actor_user_id
          )
          on conflict (source_system, source_id) do update
          set
            volunteer_id = excluded.volunteer_id,
            created_by = excluded.created_by;
        end if;

        select profile.id
        into v_target_profile_id
        from public.volunteers profile
        where profile.core_volunteer_id = p_target_volunteer_id;

        if v_target_profile_id is null then
          update public.volunteers
          set
            core_volunteer_id = p_target_volunteer_id,
            profile_origin = 'identity_relink',
            updated_at = now(),
            updated_by = p_actor_user_id
          where core_volunteer_id = v_source_volunteer_id;
        else
          delete from public.volunteers
          where core_volunteer_id = v_source_volunteer_id;
        end if;

        delete from core.volunteers
        where id = v_source_volunteer_id;

        v_source_retired := true;
      end if;
    end if;
  end if;

  perform audit.write_event(
    'roster.volunteer_identity_relinked',
    'roster',
    p_roster_id::text,
    jsonb_build_object(
      'event_id', p_event_id,
      'source_volunteer_id', v_source_volunteer_id,
      'source_volunteer_code', v_source_code,
      'target_volunteer_id', p_target_volunteer_id,
      'target_volunteer_code', v_target_code,
      'assignments_updated', v_assignment_count,
      'source_duplicate_retired', v_source_retired
    ),
    p_actor_user_id,
    null
  );

  return jsonb_build_object(
    'target_volunteer_id', p_target_volunteer_id,
    'target_volunteer_code', v_target_code,
    'target_display_name', v_target_name,
    'assignments_updated', v_assignment_count,
    'source_duplicate_retired', v_source_retired,
    'already_linked', false
  );
end;
$$;

revoke all on function public.phaseone_relink_roster_volunteer(uuid,uuid,uuid,uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_relink_roster_volunteer(uuid,uuid,uuid,uuid)
  to service_role;

commit;
