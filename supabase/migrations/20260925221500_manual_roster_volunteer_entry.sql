create or replace function public.phaseone_admin_create_or_link_volunteer_to_roster(
  p_event_id uuid,
  p_timeslot_ids uuid[],
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint,
  p_tshirt_size text,
  p_dietary_requirements text,
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
  v_normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_normalized_mobile text := public.phaseone_canonical_mobile(p_mobile);
  v_normalized_tshirt text := upper(nullif(btrim(coalesce(p_tshirt_size, '')), ''));
  v_normalized_dietary text := nullif(btrim(coalesce(p_dietary_requirements, '')), '');
  v_resolved jsonb;
  v_volunteer_id uuid;
  v_volunteer_code text;
  v_created boolean;
  v_assignment_result jsonb;
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

  if p_volunteer_name is null
     or char_length(btrim(p_volunteer_name)) < 1
     or char_length(btrim(p_volunteer_name)) > 120 then
    raise exception 'Volunteer name is required and must be 120 characters or fewer'
      using errcode = '22023';
  end if;

  if v_normalized_email is null and v_normalized_mobile is null then
    raise exception 'Email or mobile number is required for a new roster volunteer'
      using errcode = '22023';
  end if;

  if v_normalized_email is not null
     and (
       char_length(v_normalized_email) < 3
       or char_length(v_normalized_email) > 254
       or v_normalized_email not like '%@%'
     ) then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120' using errcode = '22023';
  end if;

  if v_normalized_tshirt is not null
     and v_normalized_tshirt not in ('S','M','L','XL','2XL','3XL','5XL','7XL') then
    raise exception 'Choose a supported T-shirt size' using errcode = '22023';
  end if;

  if v_normalized_dietary is not null
     and char_length(v_normalized_dietary) > 500 then
    raise exception 'Dietary requirements must be 500 characters or fewer'
      using errcode = '22023';
  end if;

  if p_timeslot_ids is null
     or cardinality(p_timeslot_ids) < 1
     or cardinality(p_timeslot_ids) > 100 then
    raise exception 'Select between 1 and 100 event shifts' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_timeslot_ids) as item;

  if v_found <> cardinality(p_timeslot_ids) then
    raise exception 'Duplicate event shifts were selected' using errcode = '22023';
  end if;

  select operations_scope
  into v_scope
  from public.phaseone_events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if v_scope = 'manual_isolated' then
    raise exception 'Isolated manual events cannot create or link canonical volunteers'
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

  v_resolved := core.resolve_manual_roster_volunteer(
    null,
    btrim(p_volunteer_name),
    v_normalized_email,
    nullif(btrim(coalesce(p_mobile, '')), ''),
    p_age
  );

  v_volunteer_id := nullif(v_resolved ->> 'volunteer_id', '')::uuid;
  v_volunteer_code := v_resolved ->> 'volunteer_code';
  v_created := coalesce((v_resolved ->> 'created')::boolean, false);

  if v_volunteer_id is null or v_volunteer_code is null then
    raise exception 'Volunteer identity could not be resolved' using errcode = 'P0001';
  end if;

  if v_normalized_email is not null then
    update core.volunteers
    set
      account_access_eligible = true,
      updated_at = now()
    where id = v_volunteer_id
      and auth_user_id is null;
  end if;

  v_assignment_result := public.phaseone_add_database_volunteers_to_roster(
    p_event_id,
    p_timeslot_ids,
    array[v_volunteer_id],
    p_actor_user_id
  );

  update public.phaseone_roster
  set
    tshirt_size = coalesce(v_normalized_tshirt, tshirt_size),
    dietary_requirements = coalesce(v_normalized_dietary, dietary_requirements),
    source_assignment_status = case
      when source_assignment_status in (
        'staff_added_from_database',
        'staff_linked_from_database'
      ) or source_assignment_status is null
        then case
          when v_created then 'staff_created_volunteer'
          else 'staff_manual_linked'
        end
      else source_assignment_status
    end
  where event_id = p_event_id
    and timeslot_id = any(p_timeslot_ids)
    and volunteer_id = v_volunteer_id;

  return coalesce(v_assignment_result, '{}'::jsonb) || jsonb_build_object(
    'volunteer_id', v_volunteer_id,
    'volunteer_code', v_volunteer_code,
    'volunteer_created', v_created,
    'display_name', (
      select display_name
      from core.volunteers
      where id = v_volunteer_id
    )
  );
end;
$$;

revoke all on function public.phaseone_admin_create_or_link_volunteer_to_roster(
  uuid,
  uuid[],
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_admin_create_or_link_volunteer_to_roster(
  uuid,
  uuid[],
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid
) to service_role;
