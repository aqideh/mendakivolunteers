begin;

create or replace function public.phaseone_open_attendance_session(
  p_event_id uuid,
  p_roster_id uuid,
  p_checked_in_at timestamptz,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_date date;
  v_created boolean := false;
  v_linked_count integer := 0;
begin
  select * into v_roster
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  select * into v_timeslot
  from public.phaseone_event_timeslots
  where id = v_roster.timeslot_id and event_id = p_event_id;
  if not found or v_timeslot.status = 'cancelled' then raise exception 'Shift is unavailable for this event'; end if;
  if p_checked_in_at is null then raise exception 'Continuous attendance requires a check-in timestamp'; end if;

  v_date := timezone('Asia/Singapore', v_timeslot.starts_at)::date;

  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = v_date
    and person_key = v_roster.attendance_person_key
    and checked_out_at is null
  order by checked_in_at
  limit 1
  for update;

  if not found then
    insert into public.phaseone_attendance_sessions (
      event_id, attendance_date, person_key, origin_roster_id, checked_in_at, checked_in_by
    ) values (
      p_event_id, v_date, v_roster.attendance_person_key, p_roster_id, p_checked_in_at, p_changed_by
    )
    on conflict do nothing
    returning * into v_session;

    if found then
      v_created := true;
    else
      select * into v_session
      from public.phaseone_attendance_sessions
      where event_id = p_event_id
        and attendance_date = v_date
        and person_key = v_roster.attendance_person_key
        and checked_out_at is null
      order by checked_in_at
      limit 1
      for update;
    end if;
  end if;

  if v_session.id is null then raise exception 'Continuous attendance session could not be created'; end if;

  insert into public.phaseone_attendance_session_shifts (
    session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
  ) values (
    v_session.id,
    p_event_id,
    p_roster_id,
    v_roster.timeslot_id,
    case when v_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
    p_changed_by
  ) on conflict (session_id, roster_id) do nothing;

  if v_roster.attendance_person_key like 'id:%' or v_roster.attendance_person_key like 'email:%' then
    with recursive eligible as (
      select
        candidate.id as roster_id,
        candidate.timeslot_id,
        candidate_slot.starts_at,
        candidate_slot.ends_at
      from public.phaseone_roster candidate
      join public.phaseone_event_timeslots candidate_slot
        on candidate_slot.id = candidate.timeslot_id
      left join public.phaseone_attendance candidate_attendance
        on candidate_attendance.event_id = candidate.event_id
       and candidate_attendance.roster_id = candidate.id
      where candidate.event_id = p_event_id
        and candidate.attendance_person_key = v_roster.attendance_person_key
        and candidate_slot.status <> 'cancelled'
        and timezone('Asia/Singapore', candidate_slot.starts_at)::date = v_date
        and candidate_attendance.non_attendance_status is null
        and candidate_attendance.signed_out_at is null
    ),
    connected as (
      select e.roster_id, e.timeslot_id, e.starts_at, e.ends_at
      from eligible e
      where e.roster_id = p_roster_id

      union

      select e.roster_id, e.timeslot_id, e.starts_at, e.ends_at
      from eligible e
      join connected c
        on e.ends_at is not null
       and c.ends_at is not null
       and e.starts_at <= c.ends_at
       and c.starts_at <= e.ends_at
    )
    insert into public.phaseone_attendance_session_shifts (
      session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
    )
    select
      v_session.id,
      p_event_id,
      connected.roster_id,
      connected.timeslot_id,
      case when connected.roster_id = v_session.origin_roster_id then 'origin' else 'scheduled' end,
      p_changed_by
    from connected
    on conflict (session_id, roster_id) do nothing;
  end if;

  select count(*) into v_linked_count
  from public.phaseone_attendance_session_shifts
  where session_id = v_session.id and roster_id <> v_session.origin_roster_id;

  if v_created then
    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, p_roster_id, 'session_opened',
      jsonb_build_object('checked_in_at', p_checked_in_at), p_changed_by
    );

    if v_linked_count > 0 then
      insert into public.phaseone_attendance_session_audit (
        session_id, event_id, roster_id, action, metadata, changed_by
      ) values (
        v_session.id, p_event_id, p_roster_id, 'scheduled_shifts_linked',
        jsonb_build_object('linked_shift_count', v_linked_count), p_changed_by
      );
    end if;
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'origin_roster_id', v_session.origin_roster_id,
    'attendance_date', v_session.attendance_date,
    'signed_in_at', v_session.checked_in_at,
    'signed_out_at', v_session.checked_out_at,
    'continuous', true
  );
end;
$$;

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
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_open_session public.phaseone_attendance_sessions%rowtype;
  v_result jsonb;
  v_session_result jsonb;
  v_date date;
  v_is_contiguous boolean := false;
begin
  if p_action not in ('mark_sign_in', 'mark_sign_out', 'mark_withdrawn', 'mark_absent', 'clear_non_attendance') then
    raise exception 'Unsupported attendance transition';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;

  select * into v_roster
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  select * into v_timeslot
  from public.phaseone_event_timeslots
  where id = v_roster.timeslot_id and event_id = p_event_id;
  if not found then raise exception 'Shift is unavailable for this event'; end if;

  v_date := timezone('Asia/Singapore', v_timeslot.starts_at)::date;

  select * into v_open_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = v_date
    and person_key = v_roster.attendance_person_key
    and checked_out_at is null
  order by checked_in_at
  limit 1
  for update;

  if p_action = 'mark_sign_out' and v_open_session.id is not null then
    return public.phaseone_close_attendance_session(
      p_event_id,
      p_roster_id,
      p_timestamp,
      p_reason,
      p_changed_by
    );
  end if;

  insert into public.phaseone_attendance (event_id, roster_id)
  values (p_event_id, p_roster_id)
  on conflict (event_id, roster_id) do nothing;

  select * into v_attendance
  from public.phaseone_attendance
  where event_id = p_event_id and roster_id = p_roster_id
  for update;

  if p_action = 'mark_sign_in' then
    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status;
    end if;

    if v_attendance.signed_in_at is not null then
      raise exception 'Volunteer is already checked in';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Cannot check in after check-out has been recorded';
    end if;

    if v_open_session.id is not null then
      select exists (
        select 1
        from public.phaseone_attendance_session_shifts linked
        join public.phaseone_event_timeslots linked_slot
          on linked_slot.id = linked.timeslot_id
        where linked.session_id = v_open_session.id
          and linked_slot.ends_at is not null
          and v_timeslot.ends_at is not null
          and v_timeslot.starts_at <= linked_slot.ends_at
          and linked_slot.starts_at <= v_timeslot.ends_at
      ) into v_is_contiguous;

      if not v_is_contiguous then
        raise exception 'Volunteer must check out of the earlier shift before checking in to a separated shift';
      end if;

      insert into public.phaseone_attendance_session_shifts (
        session_id,
        event_id,
        roster_id,
        timeslot_id,
        continuation_type,
        linked_by
      ) values (
        v_open_session.id,
        p_event_id,
        p_roster_id,
        v_roster.timeslot_id,
        case when v_open_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
        p_changed_by
      )
      on conflict (session_id, roster_id) do nothing;

      return jsonb_build_object(
        'session_id', v_open_session.id,
        'origin_roster_id', v_open_session.origin_roster_id,
        'signed_in_at', v_open_session.checked_in_at,
        'signed_out_at', null,
        'updated_at', v_open_session.updated_at,
        'continuous', true,
        'already_on_site', true
      );
    end if;

  elsif p_action = 'mark_sign_out' then
    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status;
    end if;
    if v_attendance.signed_in_at is null then
      raise exception 'Volunteer must be checked in before check-out';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Volunteer is already checked out';
    end if;

  elsif p_action in ('mark_withdrawn', 'mark_absent') then
    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is already marked as %', v_attendance.non_attendance_status;
    end if;

    if v_attendance.signed_in_at is not null or v_attendance.signed_out_at is not null then
      raise exception 'Attendance has already been recorded for this volunteer';
    end if;
    if v_open_session.id is not null then
      raise exception 'Volunteer is currently checked in';
    end if;

  else
    if v_attendance.non_attendance_status is null then
      raise exception 'Volunteer is not marked as withdrawn or absent';
    end if;
  end if;

  select public.phaseone_apply_attendance_change(
    p_event_id,
    p_roster_id,
    p_action,
    p_timestamp,
    p_reason,
    p_changed_by
  ) into v_result;

  if p_action = 'mark_sign_in' then
    select public.phaseone_open_attendance_session(
      p_event_id,
      p_roster_id,
      (v_result->>'signed_in_at')::timestamptz,
      p_changed_by
    ) into v_session_result;

    v_result := v_result || jsonb_build_object(
      'session_id', v_session_result->>'session_id',
      'continuous', true
    );
  end if;

  return v_result;
end;
$$;

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

  if v_source_slot.ends_at is null
    or v_target_slot.ends_at is null
    or v_target_slot.starts_at > v_source_slot.ends_at
    or v_source_slot.starts_at > v_target_slot.ends_at then
    raise exception 'A shift extension requires an adjacent or overlapping shift';
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
      tshirt_size, entry_method, attendance_person_key, uploaded_by, uploaded_at
    ) values (
      p_event_id, p_target_timeslot_id, v_source.volunteer_key, v_source.volunteer_name,
      v_source.email, v_source.mobile, v_source.tshirt_size, 'walk_in',
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

comment on function public.phaseone_open_attendance_session(uuid, uuid, timestamptz, uuid) is
  'Opens continuous attendance and auto-links only the connected component of adjacent/overlapping same-day shifts; separated shifts require a new attendance session.';
comment on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid) is
  'Applies event-day attendance transitions while preventing an open session from crossing a gap between shifts.';
comment on function public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid) is
  'Extends an open attendance session only into a later adjacent/overlapping shift on the same day.';

commit;
