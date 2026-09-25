alter table public.phaseone_roster
  drop constraint if exists phaseone_roster_entry_method_check;

alter table public.phaseone_roster
  add constraint phaseone_roster_entry_method_check
  check (
    entry_method in (
      'roster_import',
      'walk_in',
      'keluarga_registration',
      'staff_database'
    )
  );

comment on column public.phaseone_roster.entry_method is
  'Operational source of the roster assignment: roster_import for bulk preloads, walk_in for event-day additions, keluarga_registration for confirmed self-service registrations, staff_database for staff assignments from the canonical volunteer database.';

create or replace function public.phaseone_add_database_volunteers_to_roster(
  p_event_id uuid,
  p_timeslot_ids uuid[],
  p_volunteer_ids uuid[],
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, core, auth
as $$
declare
  v_scope text;
  v_expected integer;
  v_found integer;
  v_timeslot_id uuid;
  v_volunteer record;
  v_match_id uuid;
  v_existing_volunteer_id uuid;
  v_created integer := 0;
  v_linked integer := 0;
  v_existing integer := 0;
begin
  if p_event_id is null then
    raise exception 'Event is required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in (
        'staff',
        'volteam',
        'admin',
        'attendance_manager',
        'programme_manager'
      )
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  if p_timeslot_ids is null
     or cardinality(p_timeslot_ids) < 1
     or cardinality(p_timeslot_ids) > 100 then
    raise exception 'Select between 1 and 100 event shifts' using errcode = '22023';
  end if;

  if p_volunteer_ids is null
     or cardinality(p_volunteer_ids) < 1
     or cardinality(p_volunteer_ids) > 100 then
    raise exception 'Select between 1 and 100 volunteers' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_timeslot_ids) as item;

  if v_found <> cardinality(p_timeslot_ids) then
    raise exception 'Duplicate event shifts were selected' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_volunteer_ids) as item;

  if v_found <> cardinality(p_volunteer_ids) then
    raise exception 'Duplicate volunteers were selected' using errcode = '22023';
  end if;

  select operations_scope
  into v_scope
  from public.phaseone_events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if v_scope = 'manual_isolated' then
    raise exception 'Isolated manual events cannot link the canonical volunteer database'
      using errcode = 'P0001';
  end if;

  v_expected := cardinality(p_timeslot_ids);

  select count(*)::integer
  into v_found
  from public.phaseone_event_timeslots
  where event_id = p_event_id
    and id = any(p_timeslot_ids)
    and status <> 'cancelled';

  if v_found <> v_expected then
    raise exception 'One or more selected shifts are unavailable for this event'
      using errcode = '22023';
  end if;

  v_expected := cardinality(p_volunteer_ids);

  select count(*)::integer
  into v_found
  from core.volunteers
  where id = any(p_volunteer_ids);

  if v_found <> v_expected then
    raise exception 'One or more selected volunteers no longer exist'
      using errcode = 'P0002';
  end if;

  for v_volunteer in
    select
      id,
      volunteer_code,
      display_name,
      primary_email_normalized,
      mobile,
      age
    from core.volunteers
    where id = any(p_volunteer_ids)
    order by volunteer_code
  loop
    foreach v_timeslot_id in array p_timeslot_ids
    loop
      v_match_id := public.phaseone_find_roster_match(
        p_event_id,
        v_timeslot_id,
        v_volunteer.volunteer_code,
        v_volunteer.primary_email_normalized,
        v_volunteer.mobile,
        coalesce(nullif(btrim(v_volunteer.display_name), ''), v_volunteer.volunteer_code)
      );

      if v_match_id is null then
        insert into public.phaseone_roster (
          event_id,
          timeslot_id,
          volunteer_key,
          volunteer_name,
          email,
          mobile,
          age,
          volunteer_id,
          entry_method,
          source_assignment_status,
          uploaded_by,
          uploaded_at
        )
        values (
          p_event_id,
          v_timeslot_id,
          v_volunteer.volunteer_code,
          coalesce(nullif(btrim(v_volunteer.display_name), ''), v_volunteer.volunteer_code),
          v_volunteer.primary_email_normalized,
          v_volunteer.mobile,
          v_volunteer.age,
          v_volunteer.id,
          'staff_database',
          'staff_added_from_database',
          p_actor_user_id,
          now()
        );

        v_created := v_created + 1;
      else
        select volunteer_id
        into v_existing_volunteer_id
        from public.phaseone_roster
        where id = v_match_id
        for update;

        if v_existing_volunteer_id is not null
           and v_existing_volunteer_id <> v_volunteer.id then
          raise exception 'Existing roster assignment is linked to a different volunteer'
            using errcode = '23505';
        end if;

        update public.phaseone_roster
        set
          volunteer_id = v_volunteer.id,
          volunteer_key = v_volunteer.volunteer_code,
          volunteer_name = coalesce(
            nullif(btrim(v_volunteer.display_name), ''),
            v_volunteer.volunteer_code
          ),
          email = coalesce(v_volunteer.primary_email_normalized, email),
          mobile = coalesce(v_volunteer.mobile, mobile),
          age = coalesce(v_volunteer.age, age),
          source_assignment_status = coalesce(
            source_assignment_status,
            'staff_linked_from_database'
          ),
          uploaded_by = p_actor_user_id,
          uploaded_at = now()
        where id = v_match_id;

        if v_existing_volunteer_id is null then
          v_linked := v_linked + 1;
        else
          v_existing := v_existing + 1;
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'requested_assignments',
    cardinality(p_volunteer_ids) * cardinality(p_timeslot_ids),
    'created_assignments',
    v_created,
    'linked_existing_assignments',
    v_linked,
    'already_assigned',
    v_existing
  );
end;
$$;

revoke all on function public.phaseone_add_database_volunteers_to_roster(
  uuid,
  uuid[],
  uuid[],
  uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_add_database_volunteers_to_roster(
  uuid,
  uuid[],
  uuid[],
  uuid
) to service_role;
