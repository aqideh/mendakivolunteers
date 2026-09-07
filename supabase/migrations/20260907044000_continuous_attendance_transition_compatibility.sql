begin;

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

    -- Preserve the existing contract for the roster row that already owns a
    -- physical check-in. Continuous carry-over only short-circuits a different
    -- linked shift that has no direct check-in timestamp of its own.
    if v_attendance.signed_in_at is not null then
      raise exception 'Volunteer is already checked in';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Cannot check in after check-out has been recorded';
    end if;

    if v_open_session.id is not null then
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

    -- Keep the original error contract when this roster row already contains
    -- attendance. Only use the session-specific message for inherited status.
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

revoke all on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  to service_role;

commit;
