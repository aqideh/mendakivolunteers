alter table public.phaseone_roster
  add column if not exists dietary_requirements text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'phaseone_roster_dietary_requirements_length_check'
      and conrelid = 'public.phaseone_roster'::regclass
  ) then
    alter table public.phaseone_roster
      add constraint phaseone_roster_dietary_requirements_length_check
      check (
        dietary_requirements is null
        or char_length(btrim(dietary_requirements)) between 1 and 500
      );
  end if;
end;
$$;

comment on column public.phaseone_roster.dietary_requirements is
  'Operational meal preference, dietary requirement or allergy note supplied for the event roster. Staff-only event operations data.';

create or replace function public.phaseone_apply_roster_import(
  p_event_id uuid,
  p_mode text,
  p_file_name text,
  p_rows jsonb,
  p_uploaded_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_replaced_count integer := 0;
  v_upserted_count integer := 0;
  v_row_count integer;
  v_row record;
  v_match_id uuid;
  v_seen_matches text[] := array[]::text[];
  v_seen_key text;
begin
  if p_mode not in ('merge', 'replace') then
    raise exception 'Unsupported roster import mode';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Roster payload must be a JSON array';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 2000 then
    raise exception 'Roster must contain between 1 and 2000 rows';
  end if;
  if not exists (select 1 from public.phaseone_events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from auth.users where id = p_uploaded_by) then
    raise exception 'Staff user not found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(
      timeslot_id uuid,
      volunteer_key text,
      volunteer_name text,
      email text,
      mobile text,
      tshirt_size text,
      dietary_requirements text
    )
    where r.timeslot_id is null
      or nullif(btrim(r.volunteer_name), '') is null
  ) then
    raise exception 'Roster contains a blank timeslot or volunteer name';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(timeslot_id uuid)
    left join public.phaseone_event_timeslots timeslot on timeslot.id = r.timeslot_id
    where timeslot.id is null or timeslot.event_id <> p_event_id
  ) then
    raise exception 'Roster contains a shift that does not belong to this event';
  end if;

  if exists (
    select 1
    from (
      select r.timeslot_id, 'id:' || lower(btrim(r.volunteer_key)) as identity_key
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, volunteer_key text)
      where nullif(btrim(r.volunteer_key), '') is not null

      union all

      select r.timeslot_id, 'email:' || lower(btrim(r.email))
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, email text)
      where nullif(btrim(r.email), '') is not null

      union all

      select r.timeslot_id, 'mobile:' || public.phaseone_canonical_mobile(r.mobile)
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, mobile text)
      where public.phaseone_canonical_mobile(r.mobile) is not null

      union all

      select r.timeslot_id, 'name:' || lower(btrim(regexp_replace(r.volunteer_name, '\s+', ' ', 'g')))
      from jsonb_to_recordset(p_rows) as r(
        timeslot_id uuid,
        volunteer_key text,
        volunteer_name text,
        email text,
        mobile text
      )
      where nullif(btrim(r.volunteer_key), '') is null
        and nullif(btrim(r.email), '') is null
        and public.phaseone_canonical_mobile(r.mobile) is null
    ) identities
    group by identities.timeslot_id, identities.identity_key
    having count(*) > 1
  ) then
    raise exception 'Roster contains duplicate volunteer identifiers within the same shift';
  end if;

  if p_mode = 'replace' then
    if exists (select 1 from public.phaseone_attendance where event_id = p_event_id) then
      raise exception 'A roster with attendance records cannot be replaced';
    end if;
    select count(*) into v_replaced_count
    from public.phaseone_roster
    where event_id = p_event_id;
    delete from public.phaseone_roster where event_id = p_event_id;
  end if;

  for v_row in
    select *
    from jsonb_to_recordset(p_rows) as r(
      timeslot_id uuid,
      volunteer_key text,
      volunteer_name text,
      email text,
      mobile text,
      tshirt_size text,
      dietary_requirements text
    )
  loop
    v_match_id := public.phaseone_find_roster_match(
      p_event_id,
      v_row.timeslot_id,
      v_row.volunteer_key,
      v_row.email,
      v_row.mobile,
      v_row.volunteer_name
    );

    if v_match_id is not null then
      v_seen_key := v_row.timeslot_id::text || ':' || v_match_id::text;
      if v_seen_key = any(v_seen_matches) then
        raise exception 'Roster contains duplicate volunteer identities within the same shift';
      end if;
      v_seen_matches := array_append(v_seen_matches, v_seen_key);

      update public.phaseone_roster
      set volunteer_key = coalesce(nullif(btrim(v_row.volunteer_key), ''), volunteer_key),
          volunteer_name = btrim(v_row.volunteer_name),
          email = coalesce(nullif(btrim(v_row.email), ''), email),
          mobile = coalesce(nullif(btrim(v_row.mobile), ''), mobile),
          tshirt_size = coalesce(nullif(btrim(v_row.tshirt_size), ''), tshirt_size),
          dietary_requirements = coalesce(nullif(btrim(v_row.dietary_requirements), ''), dietary_requirements),
          uploaded_by = p_uploaded_by,
          uploaded_at = now()
      where id = v_match_id;
    else
      insert into public.phaseone_roster (
        event_id,
        timeslot_id,
        volunteer_key,
        volunteer_name,
        email,
        mobile,
        tshirt_size,
        dietary_requirements,
        uploaded_by,
        uploaded_at
      ) values (
        p_event_id,
        v_row.timeslot_id,
        nullif(btrim(v_row.volunteer_key), ''),
        btrim(v_row.volunteer_name),
        nullif(btrim(v_row.email), ''),
        nullif(btrim(v_row.mobile), ''),
        nullif(btrim(v_row.tshirt_size), ''),
        nullif(btrim(v_row.dietary_requirements), ''),
        p_uploaded_by,
        now()
      )
      returning id into v_match_id;

      v_seen_matches := array_append(
        v_seen_matches,
        v_row.timeslot_id::text || ':' || v_match_id::text
      );
    end if;

    v_upserted_count := v_upserted_count + 1;
  end loop;

  insert into public.phaseone_roster_imports (
    event_id,
    mode,
    file_name,
    row_count,
    replaced_count,
    uploaded_by
  ) values (
    p_event_id,
    p_mode,
    left(p_file_name, 255),
    v_row_count,
    v_replaced_count,
    p_uploaded_by
  ) returning id into v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'row_count', v_row_count,
    'upserted_count', v_upserted_count,
    'replaced_count', v_replaced_count
  );
end;
$$;

revoke all on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid)
  to service_role;

create or replace function public.phaseone_add_walk_in_volunteer(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_tshirt_size text,
  p_dietary_requirements text,
  p_check_in boolean,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_volunteer_key text := nullif(btrim(coalesce(p_volunteer_key, '')), '');
  v_volunteer_name text := btrim(coalesce(p_volunteer_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  v_tshirt_size text := nullif(btrim(coalesce(p_tshirt_size, '')), '');
  v_dietary_requirements text := nullif(btrim(coalesce(p_dietary_requirements, '')), '');
  v_roster_id uuid;
  v_attendance jsonb;
  v_signed_in_at timestamptz;
  v_signed_out_at timestamptz;
begin
  if not exists (select 1 from public.phaseone_events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  if not exists (
    select 1
    from public.phaseone_event_timeslots
    where id = p_timeslot_id
      and event_id = p_event_id
      and status <> 'cancelled'
  ) then
    raise exception 'Shift is unavailable for this event';
  end if;
  if v_volunteer_name = '' or char_length(v_volunteer_name) > 200 then
    raise exception 'Volunteer name must be between 1 and 200 characters';
  end if;
  if v_volunteer_key is not null and char_length(v_volunteer_key) > 100 then
    raise exception 'Volunteer ID must be 100 characters or fewer';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    raise exception 'Email must be 320 characters or fewer';
  end if;
  if v_mobile is not null and char_length(v_mobile) > 50 then
    raise exception 'Contact number must be 50 characters or fewer';
  end if;
  if v_tshirt_size is not null and char_length(v_tshirt_size) > 20 then
    raise exception 'T-shirt size must be 20 characters or fewer';
  end if;
  if v_dietary_requirements is not null and char_length(v_dietary_requirements) > 500 then
    raise exception 'Meal or dietary requirements must be 500 characters or fewer';
  end if;
  if p_check_in is null then
    raise exception 'Check-in choice is required';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;

  v_roster_id := public.phaseone_find_roster_match(
    p_event_id,
    p_timeslot_id,
    v_volunteer_key,
    v_email,
    v_mobile,
    v_volunteer_name
  );

  if v_roster_id is not null then
    if v_dietary_requirements is not null then
      update public.phaseone_roster
      set dietary_requirements = v_dietary_requirements
      where id = v_roster_id;
    end if;

    if p_check_in then
      select signed_in_at, signed_out_at
      into v_signed_in_at, v_signed_out_at
      from public.phaseone_attendance
      where event_id = p_event_id and roster_id = v_roster_id;

      if v_signed_out_at is not null then
        return jsonb_build_object(
          'status', 'duplicate_completed',
          'roster_id', v_roster_id,
          'checked_in', false
        );
      end if;

      if v_signed_in_at is null then
        select public.phaseone_apply_attendance_transition(
          p_event_id,
          v_roster_id,
          'mark_sign_in',
          null,
          'Last-minute volunteer matched existing roster and checked in',
          p_changed_by
        ) into v_attendance;
      end if;

      return jsonb_build_object(
        'status', 'duplicate',
        'roster_id', v_roster_id,
        'checked_in', true,
        'attendance', v_attendance
      );
    end if;

    return jsonb_build_object(
      'status', 'duplicate',
      'roster_id', v_roster_id,
      'checked_in', false
    );
  end if;

  insert into public.phaseone_roster (
    event_id,
    timeslot_id,
    volunteer_key,
    volunteer_name,
    email,
    mobile,
    tshirt_size,
    dietary_requirements,
    entry_method,
    uploaded_by,
    uploaded_at
  ) values (
    p_event_id,
    p_timeslot_id,
    v_volunteer_key,
    v_volunteer_name,
    v_email,
    v_mobile,
    v_tshirt_size,
    v_dietary_requirements,
    'walk_in',
    p_changed_by,
    now()
  )
  on conflict do nothing
  returning id into v_roster_id;

  if v_roster_id is null then
    v_roster_id := public.phaseone_find_roster_match(
      p_event_id,
      p_timeslot_id,
      v_volunteer_key,
      v_email,
      v_mobile,
      v_volunteer_name
    );

    if v_roster_id is null then
      raise exception 'Volunteer roster record could not be created or matched';
    end if;

    return jsonb_build_object(
      'status', 'duplicate',
      'roster_id', v_roster_id,
      'checked_in', false
    );
  end if;

  if p_check_in then
    select public.phaseone_apply_attendance_transition(
      p_event_id,
      v_roster_id,
      'mark_sign_in',
      null,
      'Last-minute volunteer added and checked in',
      p_changed_by
    ) into v_attendance;
  end if;

  return jsonb_build_object(
    'status', 'created',
    'roster_id', v_roster_id,
    'checked_in', p_check_in,
    'attendance', v_attendance
  );
end;
$$;

revoke all on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, text, boolean, uuid
) to service_role;

create or replace function public.phaseone_add_walk_in_volunteer(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_tshirt_size text,
  p_check_in boolean,
  p_changed_by uuid
) returns jsonb
language sql
security invoker
set search_path = public, pg_temp
as $$
  select public.phaseone_add_walk_in_volunteer(
    p_event_id,
    p_timeslot_id,
    p_volunteer_key,
    p_volunteer_name,
    p_email,
    p_mobile,
    p_tshirt_size,
    null,
    p_check_in,
    p_changed_by
  );
$$;

revoke all on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, boolean, uuid
) to service_role;

create or replace function public.phaseone_extend_attendance_session(
  p_event_id uuid,
  p_source_roster_id uuid,
  p_target_timeslot_id uuid,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.phaseone_roster%rowtype;
  v_source_slot public.phaseone_event_timeslots%rowtype;
  v_target_slot public.phaseone_event_timeslots%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_target_roster_id uuid;
  v_existing_type text;
  v_created boolean := false;
begin
  if not exists (select 1 from auth.users where id = p_changed_by) then raise exception 'Staff user not found'; end if;

  select * into v_source from public.phaseone_roster where id = p_source_roster_id and event_id = p_event_id;
  if not found then raise exception 'Source roster record does not belong to this event'; end if;

  select * into v_source_slot from public.phaseone_event_timeslots where id = v_source.timeslot_id and event_id = p_event_id;
  select * into v_target_slot
  from public.phaseone_event_timeslots
  where id = p_target_timeslot_id and event_id = p_event_id and status <> 'cancelled';
  if v_target_slot.id is null then raise exception 'Target shift is unavailable for this event'; end if;

  if timezone('Asia/Singapore', v_source_slot.starts_at)::date <> timezone('Asia/Singapore', v_target_slot.starts_at)::date
    or v_target_slot.starts_at <= v_source_slot.starts_at then
    raise exception 'A shift extension must move to a later shift on the same day';
  end if;

  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = timezone('Asia/Singapore', v_source_slot.starts_at)::date
    and person_key = v_source.attendance_person_key
    and checked_out_at is null
  order by checked_in_at limit 1 for update;
  if not found then raise exception 'Volunteer is not currently checked in'; end if;

  select id into v_target_roster_id
  from public.phaseone_roster
  where event_id = p_event_id
    and timeslot_id = p_target_timeslot_id
    and attendance_person_key = v_source.attendance_person_key
  limit 1;

  if v_target_roster_id is null then
    insert into public.phaseone_roster (
      event_id, timeslot_id, volunteer_key, volunteer_name, email, mobile,
      tshirt_size, dietary_requirements, entry_method, attendance_person_key, uploaded_by, uploaded_at
    ) values (
      p_event_id, p_target_timeslot_id, v_source.volunteer_key, v_source.volunteer_name,
      v_source.email, v_source.mobile, v_source.tshirt_size, v_source.dietary_requirements, 'walk_in',
      v_source.attendance_person_key, p_changed_by, now()
    )
    on conflict do nothing
    returning id into v_target_roster_id;

    if v_target_roster_id is null then
      select id into v_target_roster_id
      from public.phaseone_roster
      where event_id = p_event_id
        and timeslot_id = p_target_timeslot_id
        and attendance_person_key = v_source.attendance_person_key
      limit 1;
    else
      v_created := true;
    end if;
  end if;

  if v_target_roster_id is null then
    raise exception 'Could not safely create the next-shift assignment. Add a volunteer ID or email before extending this volunteer.';
  end if;

  select continuation_type into v_existing_type
  from public.phaseone_attendance_session_shifts
  where session_id = v_session.id and roster_id = v_target_roster_id;

  if v_existing_type is null then
    insert into public.phaseone_attendance_session_shifts (
      session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
    ) values (
      v_session.id, p_event_id, v_target_roster_id, p_target_timeslot_id, 'extended_on_site', p_changed_by
    );

    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, v_target_roster_id, 'shift_extended',
      jsonb_build_object('source_roster_id', p_source_roster_id, 'target_timeslot_id', p_target_timeslot_id, 'roster_created', v_created),
      p_changed_by
    );

    v_existing_type := 'extended_on_site';
  end if;

  return jsonb_build_object(
    'status', case when v_existing_type = 'scheduled' then 'already_scheduled' else 'extended' end,
    'session_id', v_session.id,
    'target_roster_id', v_target_roster_id,
    'continuation_type', v_existing_type,
    'roster_created', v_created
  );
end;
$$;

revoke all on function public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid)
  to service_role;
