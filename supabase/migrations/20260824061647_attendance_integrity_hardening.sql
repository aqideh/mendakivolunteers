create or replace function public.phaseone_canonical_mobile(p_mobile text)
returns text
language sql
immutable
parallel safe
set search_path = pg_catalog
as $$
  with normalized as (
    select regexp_replace(coalesce(p_mobile, ''), '\D', '', 'g') as digits
  )
  select nullif(
    case
      when digits ~ '^0065[0-9]{8}$' then substr(digits, 5)
      when digits ~ '^65[0-9]{8}$' then substr(digits, 3)
      else digits
    end,
    ''
  )
  from normalized;
$$;

revoke all on function public.phaseone_canonical_mobile(text) from public, anon, authenticated;
grant execute on function public.phaseone_canonical_mobile(text) to service_role;

do $$
begin
  if exists (
    select 1
    from public.phaseone_roster
    where nullif(btrim(volunteer_key), '') is not null
    group by event_id, timeslot_id, lower(btrim(volunteer_key))
    having count(*) > 1
  ) then
    raise exception 'Existing roster contains duplicate volunteer IDs within a shift';
  end if;

  if exists (
    select 1
    from public.phaseone_roster
    where nullif(btrim(email), '') is not null
    group by event_id, timeslot_id, lower(btrim(email))
    having count(*) > 1
  ) then
    raise exception 'Existing roster contains duplicate emails within a shift';
  end if;

  if exists (
    select 1
    from public.phaseone_roster
    where public.phaseone_canonical_mobile(mobile) is not null
    group by event_id, timeslot_id, public.phaseone_canonical_mobile(mobile)
    having count(*) > 1
  ) then
    raise exception 'Existing roster contains duplicate canonical contact numbers within a shift';
  end if;
end;
$$;

drop index if exists public.phaseone_roster_event_timeslot_match_uidx;

alter table public.phaseone_roster
  drop column if exists roster_match_key;

alter table public.phaseone_roster
  add column roster_match_key text generated always as (
    case
      when nullif(btrim(volunteer_key), '') is not null
        then 'id:' || lower(btrim(volunteer_key))
      when nullif(btrim(email), '') is not null
        then 'email:' || lower(btrim(email))
      when public.phaseone_canonical_mobile(mobile) is not null
        then 'mobile:' || public.phaseone_canonical_mobile(mobile)
      else 'name:' || lower(btrim(regexp_replace(volunteer_name, '\s+', ' ', 'g')))
    end
  ) stored;

create unique index phaseone_roster_event_timeslot_match_uidx
  on public.phaseone_roster (event_id, timeslot_id, roster_match_key);

create unique index if not exists phaseone_roster_event_timeslot_volunteer_id_uidx
  on public.phaseone_roster (event_id, timeslot_id, lower(btrim(volunteer_key)))
  where nullif(btrim(volunteer_key), '') is not null;

create unique index if not exists phaseone_roster_event_timeslot_email_uidx
  on public.phaseone_roster (event_id, timeslot_id, lower(btrim(email)))
  where nullif(btrim(email), '') is not null;

create unique index if not exists phaseone_roster_event_timeslot_mobile_uidx
  on public.phaseone_roster (event_id, timeslot_id, public.phaseone_canonical_mobile(mobile))
  where public.phaseone_canonical_mobile(mobile) is not null;

comment on column public.phaseone_roster.roster_match_key is
  'Generated roster identity key using volunteer ID, then email, canonical Singapore contact number, then normalized name as fallback.';

create or replace function public.phaseone_find_roster_match(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_email text,
  p_mobile text,
  p_volunteer_name text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_volunteer_key text := nullif(lower(btrim(coalesce(p_volunteer_key, ''))), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_mobile text := public.phaseone_canonical_mobile(p_mobile);
  v_name text := lower(btrim(regexp_replace(coalesce(p_volunteer_name, ''), '\s+', ' ', 'g')));
  v_matches uuid[];
  v_match_count integer;
begin
  if v_volunteer_key is not null or v_email is not null or v_mobile is not null then
    select array_agg(candidate.id order by candidate.id)
    into v_matches
    from (
      select distinct roster.id
      from public.phaseone_roster roster
      where roster.event_id = p_event_id
        and roster.timeslot_id = p_timeslot_id
        and (
          (v_volunteer_key is not null and lower(btrim(roster.volunteer_key)) = v_volunteer_key)
          or (v_email is not null and lower(btrim(roster.email)) = v_email)
          or (v_mobile is not null and public.phaseone_canonical_mobile(roster.mobile) = v_mobile)
        )
    ) candidate;
  else
    select array_agg(candidate.id order by candidate.id)
    into v_matches
    from (
      select roster.id
      from public.phaseone_roster roster
      where roster.event_id = p_event_id
        and roster.timeslot_id = p_timeslot_id
        and lower(btrim(regexp_replace(roster.volunteer_name, '\s+', ' ', 'g'))) = v_name
    ) candidate;
  end if;

  v_match_count := coalesce(array_length(v_matches, 1), 0);

  if v_match_count > 1 then
    raise exception 'Volunteer details match multiple roster records for this shift; provide a more specific identifier';
  end if;

  if v_match_count = 1 then
    return v_matches[1];
  end if;

  return null;
end;
$$;

revoke all on function public.phaseone_find_roster_match(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.phaseone_find_roster_match(uuid, uuid, text, text, text, text)
  to service_role;

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
      tshirt_size text
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
      tshirt_size text
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

create or replace function public.phaseone_apply_attendance_change(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz,
  p_reason text,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attendance public.phaseone_attendance%rowtype;
  v_updated public.phaseone_attendance%rowtype;
  v_effective_timestamp timestamptz := coalesce(p_timestamp, now());
  v_reason text := btrim(p_reason);
begin
  if p_action not in ('mark_sign_in', 'mark_sign_out', 'clear_sign_in', 'clear_sign_out') then
    raise exception 'Unsupported attendance action';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'A reason between 5 and 500 characters is required';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;
  if not exists (
    select 1 from public.phaseone_roster where id = p_roster_id and event_id = p_event_id
  ) then
    raise exception 'Roster record does not belong to this event';
  end if;

  insert into public.phaseone_attendance (event_id, roster_id)
  values (p_event_id, p_roster_id)
  on conflict (event_id, roster_id) do nothing;

  select * into v_attendance
  from public.phaseone_attendance
  where event_id = p_event_id and roster_id = p_roster_id
  for update;

  if p_action = 'clear_sign_in' and v_attendance.signed_in_at is null then
    raise exception 'Sign-in is already clear';
  end if;
  if p_action = 'clear_sign_out' and v_attendance.signed_out_at is null then
    raise exception 'Sign-out is already clear';
  end if;
  if p_action = 'clear_sign_in' and v_attendance.signed_out_at is not null then
    raise exception 'Clear check-out before clearing check-in';
  end if;
  if p_action = 'mark_sign_out' and v_attendance.signed_in_at is null then
    raise exception 'Check-in must be recorded before check-out';
  end if;
  if p_action = 'mark_sign_in'
    and v_attendance.signed_out_at is not null
    and v_effective_timestamp > v_attendance.signed_out_at then
    raise exception 'Sign-in cannot be after sign-out';
  end if;
  if p_action = 'mark_sign_out'
    and v_attendance.signed_in_at is not null
    and v_effective_timestamp < v_attendance.signed_in_at then
    raise exception 'Sign-out cannot be before sign-in';
  end if;

  update public.phaseone_attendance
  set signed_in_at = case
        when p_action = 'mark_sign_in' then v_effective_timestamp
        when p_action = 'clear_sign_in' then null
        else signed_in_at
      end,
      signed_out_at = case
        when p_action = 'mark_sign_out' then v_effective_timestamp
        when p_action = 'clear_sign_out' then null
        else signed_out_at
      end,
      signed_in_marked_by = case
        when p_action = 'mark_sign_in' then p_changed_by
        when p_action = 'clear_sign_in' then null
        else signed_in_marked_by
      end,
      signed_out_marked_by = case
        when p_action = 'mark_sign_out' then p_changed_by
        when p_action = 'clear_sign_out' then null
        else signed_out_marked_by
      end,
      updated_at = now()
  where id = v_attendance.id
  returning * into v_updated;

  insert into public.phaseone_attendance_audit (
    event_id,
    roster_id,
    attendance_id,
    action,
    reason,
    old_signed_in_at,
    old_signed_out_at,
    new_signed_in_at,
    new_signed_out_at,
    changed_by
  ) values (
    p_event_id,
    p_roster_id,
    v_updated.id,
    p_action,
    v_reason,
    v_attendance.signed_in_at,
    v_attendance.signed_out_at,
    v_updated.signed_in_at,
    v_updated.signed_out_at,
    p_changed_by
  );

  return jsonb_build_object(
    'attendance_id', v_updated.id,
    'signed_in_at', v_updated.signed_in_at,
    'signed_out_at', v_updated.signed_out_at,
    'updated_at', v_updated.updated_at
  );
end;
$$;

revoke all on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid)
  to service_role;

create or replace function public.phaseone_apply_attendance_transition(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz,
  p_reason text,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attendance public.phaseone_attendance%rowtype;
begin
  if p_action not in ('mark_sign_in', 'mark_sign_out') then
    raise exception 'Unsupported attendance transition';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;
  if not exists (
    select 1 from public.phaseone_roster where id = p_roster_id and event_id = p_event_id
  ) then
    raise exception 'Roster record does not belong to this event';
  end if;

  insert into public.phaseone_attendance (event_id, roster_id)
  values (p_event_id, p_roster_id)
  on conflict (event_id, roster_id) do nothing;

  select * into v_attendance
  from public.phaseone_attendance
  where event_id = p_event_id and roster_id = p_roster_id
  for update;

  if p_action = 'mark_sign_in' then
    if v_attendance.signed_in_at is not null then
      raise exception 'Volunteer is already checked in';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Cannot check in after check-out has been recorded';
    end if;
  else
    if v_attendance.signed_in_at is null then
      raise exception 'Volunteer must be checked in before check-out';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Volunteer is already checked out';
    end if;
  end if;

  return public.phaseone_apply_attendance_change(
    p_event_id,
    p_roster_id,
    p_action,
    p_timestamp,
    p_reason,
    p_changed_by
  );
end;
$$;

revoke all on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  to service_role;

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
  uuid, uuid, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, boolean, uuid
) to service_role;
