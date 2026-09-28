begin;

create or replace function public.phaseone_apply_qr_attendance(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_attendance public.phaseone_attendance%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_effective_timestamp timestamptz := coalesce(p_timestamp, now());
  v_date date;
  v_linked_count integer := 0;
  v_closed_count integer := 0;
  v_open record;
  v_is_contiguous boolean := false;
begin
  if p_action not in ('check_in', 'check_out') then
    raise exception 'Unsupported QR attendance action';
  end if;

  select * into v_roster
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  select * into v_timeslot
  from public.phaseone_event_timeslots
  where id = v_roster.timeslot_id
    and event_id = p_event_id
    and status <> 'cancelled';
  if not found then raise exception 'Shift is unavailable for this event'; end if;

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

  if p_action = 'check_in' then
    if v_session.id is not null then
      select exists (
        select 1
        from public.phaseone_attendance_session_shifts linked
        join public.phaseone_event_timeslots linked_slot
          on linked_slot.id = linked.timeslot_id
        where linked.session_id = v_session.id
          and linked_slot.ends_at is not null
          and v_timeslot.ends_at is not null
          and v_timeslot.starts_at <= linked_slot.ends_at
          and linked_slot.starts_at <= v_timeslot.ends_at
      ) into v_is_contiguous;

      if not v_is_contiguous then
        raise exception 'Volunteer must check out of the earlier shift before checking in to a separated shift';
      end if;

      insert into public.phaseone_attendance_session_shifts (
        session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
      ) values (
        v_session.id, p_event_id, p_roster_id, v_roster.timeslot_id,
        case when v_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
        null
      ) on conflict (session_id, roster_id) do nothing;

      return jsonb_build_object(
        'status', 'already_checked_in',
        'session_id', v_session.id,
        'signed_in_at', v_session.checked_in_at,
        'signed_out_at', null,
        'continuous', true
      );
    end if;

    insert into public.phaseone_attendance (event_id, roster_id)
    values (p_event_id, p_roster_id)
    on conflict (event_id, roster_id) do nothing;

    select * into v_attendance
    from public.phaseone_attendance
    where event_id = p_event_id and roster_id = p_roster_id
    for update;

    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status;
    end if;
    if v_attendance.signed_out_at is not null then
      return jsonb_build_object('status', 'already_checked_out', 'signed_out_at', v_attendance.signed_out_at);
    end if;
    if v_attendance.signed_in_at is not null then
      return jsonb_build_object('status', 'already_checked_in', 'signed_in_at', v_attendance.signed_in_at);
    end if;

    update public.phaseone_attendance
    set signed_in_at = v_effective_timestamp,
        signed_in_marked_by = null,
        updated_at = now()
    where id = v_attendance.id
    returning * into v_attendance;

    insert into public.phaseone_attendance_audit (
      event_id, roster_id, attendance_id, action, reason,
      old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at,
      old_non_attendance_status, new_non_attendance_status, changed_by, source_type
    ) values (
      p_event_id, p_roster_id, v_attendance.id, 'mark_sign_in', 'Volunteer QR check-in',
      null, null, v_attendance.signed_in_at, null,
      null, null, null, 'volunteer_qr'
    );

    insert into public.phaseone_attendance_sessions (
      event_id, attendance_date, person_key, origin_roster_id, checked_in_at, checked_in_by
    ) values (
      p_event_id, v_date, v_roster.attendance_person_key, p_roster_id, v_effective_timestamp, null
    )
    returning * into v_session;

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
      case when connected.roster_id = p_roster_id then 'origin' else 'scheduled' end,
      null
    from connected
    on conflict (session_id, roster_id) do nothing;

    get diagnostics v_linked_count = row_count;

    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, p_roster_id, 'session_opened',
      jsonb_build_object(
        'checked_in_at', v_effective_timestamp,
        'source', 'volunteer_qr',
        'linked_shift_count', greatest(v_linked_count - 1, 0)
      ),
      null
    );

    return jsonb_build_object(
      'status', 'checked_in',
      'session_id', v_session.id,
      'signed_in_at', v_effective_timestamp,
      'signed_out_at', null,
      'continuous', true
    );
  end if;

  if v_session.id is null then
    select * into v_attendance
    from public.phaseone_attendance
    where event_id = p_event_id and roster_id = p_roster_id;

    if v_attendance.signed_out_at is not null then
      return jsonb_build_object('status', 'already_checked_out', 'signed_out_at', v_attendance.signed_out_at);
    end if;
    return jsonb_build_object('status', 'not_checked_in');
  end if;

  if v_effective_timestamp < v_session.checked_in_at then
    raise exception 'Check-out cannot be before the event-day check-in';
  end if;

  for v_open in
    select attendance.*
    from public.phaseone_attendance_session_shifts linked
    join public.phaseone_attendance attendance
      on attendance.event_id = linked.event_id
      and attendance.roster_id = linked.roster_id
    where linked.session_id = v_session.id
      and attendance.signed_in_at is not null
      and attendance.signed_out_at is null
      and attendance.non_attendance_status is null
    for update of attendance
  loop
    update public.phaseone_attendance
    set signed_out_at = v_effective_timestamp,
        signed_out_marked_by = null,
        updated_at = now()
    where id = v_open.id;

    insert into public.phaseone_attendance_audit (
      event_id, roster_id, attendance_id, action, reason,
      old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at,
      old_non_attendance_status, new_non_attendance_status, changed_by, source_type
    ) values (
      p_event_id, v_open.roster_id, v_open.id, 'mark_sign_out', 'Volunteer QR check-out',
      v_open.signed_in_at, null, v_open.signed_in_at, v_effective_timestamp,
      null, null, null, 'volunteer_qr'
    );
    v_closed_count := v_closed_count + 1;
  end loop;

  update public.phaseone_attendance_sessions
  set checked_out_at = v_effective_timestamp,
      checked_out_by = null,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.phaseone_attendance_session_audit (
    session_id, event_id, roster_id, action, metadata, changed_by
  ) values (
    v_session.id, p_event_id, p_roster_id, 'session_closed',
    jsonb_build_object(
      'checked_out_at', v_effective_timestamp,
      'source', 'volunteer_qr',
      'direct_attendance_rows_closed', v_closed_count
    ),
    null
  );

  return jsonb_build_object(
    'status', 'checked_out',
    'session_id', v_session.id,
    'signed_in_at', v_session.checked_in_at,
    'signed_out_at', v_session.checked_out_at,
    'continuous', true
  );
end;
$$;

comment on function public.phaseone_apply_qr_attendance(uuid, uuid, text, timestamptz) is
  'Volunteer QR attendance preserves continuous attendance only across adjacent/overlapping same-day shifts; separated shifts require checkout and a fresh check-in.';

commit;
