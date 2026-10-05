begin;

alter table public.phaseone_attendance_audit
  add column if not exists batch_id uuid;

create index if not exists phaseone_attendance_audit_batch_idx
  on public.phaseone_attendance_audit (batch_id)
  where batch_id is not null;

create or replace function public.phaseone_apply_attendance_change(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz,
  p_reason text,
  p_changed_by uuid,
  p_batch_id uuid
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
  if p_action not in ('mark_sign_in','mark_sign_out','clear_sign_in','clear_sign_out','mark_withdrawn','mark_absent','clear_non_attendance') then
    raise exception 'Unsupported attendance action';
  end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then
    raise exception 'A reason between 5 and 500 characters is required';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;
  if not exists (select 1 from public.phaseone_roster where id = p_roster_id and event_id = p_event_id) then
    raise exception 'Roster record does not belong to this event';
  end if;

  insert into public.phaseone_attendance (event_id, roster_id)
  values (p_event_id, p_roster_id)
  on conflict (event_id, roster_id) do nothing;

  select * into v_attendance
  from public.phaseone_attendance
  where event_id = p_event_id and roster_id = p_roster_id
  for update;

  if p_action in ('mark_sign_in','mark_sign_out','clear_sign_in','clear_sign_out')
    and v_attendance.non_attendance_status is not null then
    raise exception 'Clear the volunteer non-attendance status before changing check-in or check-out';
  end if;
  if p_action in ('mark_withdrawn','mark_absent')
    and (v_attendance.signed_in_at is not null or v_attendance.signed_out_at is not null) then
    raise exception 'Attendance has already been recorded for this volunteer';
  end if;
  if p_action = 'clear_non_attendance' and v_attendance.non_attendance_status is null then
    raise exception 'Non-attendance status is already clear';
  end if;
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
  if p_action = 'mark_sign_in' and v_attendance.signed_out_at is not null and v_effective_timestamp > v_attendance.signed_out_at then
    raise exception 'Sign-in cannot be after sign-out';
  end if;
  if p_action = 'mark_sign_out' and v_attendance.signed_in_at is not null and v_effective_timestamp < v_attendance.signed_in_at then
    raise exception 'Sign-out cannot be before sign-in';
  end if;

  update public.phaseone_attendance
  set signed_in_at = case when p_action = 'mark_sign_in' then v_effective_timestamp when p_action = 'clear_sign_in' then null else signed_in_at end,
      signed_out_at = case when p_action = 'mark_sign_out' then v_effective_timestamp when p_action = 'clear_sign_out' then null else signed_out_at end,
      signed_in_marked_by = case when p_action = 'mark_sign_in' then p_changed_by when p_action = 'clear_sign_in' then null else signed_in_marked_by end,
      signed_out_marked_by = case when p_action = 'mark_sign_out' then p_changed_by when p_action = 'clear_sign_out' then null else signed_out_marked_by end,
      non_attendance_status = case when p_action = 'mark_withdrawn' then 'withdrawn' when p_action = 'mark_absent' then 'absent' when p_action = 'clear_non_attendance' then null else non_attendance_status end,
      non_attendance_marked_by = case when p_action in ('mark_withdrawn','mark_absent') then p_changed_by when p_action = 'clear_non_attendance' then null else non_attendance_marked_by end,
      non_attendance_marked_at = case when p_action in ('mark_withdrawn','mark_absent') then v_effective_timestamp when p_action = 'clear_non_attendance' then null else non_attendance_marked_at end,
      updated_at = now()
  where id = v_attendance.id
  returning * into v_updated;

  insert into public.phaseone_attendance_audit (
    event_id, roster_id, attendance_id, action, reason,
    old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at,
    old_non_attendance_status, new_non_attendance_status, changed_by, batch_id
  ) values (
    p_event_id, p_roster_id, v_updated.id, p_action, v_reason,
    v_attendance.signed_in_at, v_attendance.signed_out_at, v_updated.signed_in_at, v_updated.signed_out_at,
    v_attendance.non_attendance_status, v_updated.non_attendance_status, p_changed_by, p_batch_id
  );

  return jsonb_build_object(
    'attendance_id', v_updated.id,
    'signed_in_at', v_updated.signed_in_at,
    'signed_out_at', v_updated.signed_out_at,
    'non_attendance_status', v_updated.non_attendance_status,
    'non_attendance_marked_at', v_updated.non_attendance_marked_at,
    'updated_at', v_updated.updated_at,
    'batch_id', p_batch_id
  );
end;
$$;

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
begin
  return public.phaseone_apply_attendance_change(
    p_event_id,
    p_roster_id,
    p_action,
    p_timestamp,
    p_reason,
    p_changed_by,
    null
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
  where id = p_roster_id and event_id = p_event_id
  for update;
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
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status; end if;
    if v_attendance.signed_in_at is not null then raise exception 'Volunteer is already checked in'; end if;
    if v_attendance.signed_out_at is not null then raise exception 'Cannot check in after check-out has been recorded'; end if;

    if v_open_session.id is not null then
      select exists (
        select 1
        from public.phaseone_attendance_session_shifts linked
        join public.phaseone_event_timeslots linked_slot on linked_slot.id = linked.timeslot_id
        where linked.session_id = v_open_session.id
          and linked_slot.ends_at is not null
          and v_timeslot.ends_at is not null
          and v_timeslot.starts_at <= linked_slot.ends_at
          and linked_slot.starts_at <= v_timeslot.ends_at
      ) into v_is_contiguous;
      if not v_is_contiguous then raise exception 'Volunteer must check out of the earlier shift before checking in to a separated shift'; end if;

      insert into public.phaseone_attendance_session_shifts (
        session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
      ) values (
        v_open_session.id, p_event_id, p_roster_id, v_roster.timeslot_id,
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
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status; end if;
    if v_attendance.signed_in_at is null then raise exception 'Volunteer must be checked in before check-out'; end if;
    if v_attendance.signed_out_at is not null then raise exception 'Volunteer is already checked out'; end if;
  elsif p_action in ('mark_withdrawn', 'mark_absent') then
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is already marked as %', v_attendance.non_attendance_status; end if;
    if v_attendance.signed_in_at is not null or v_attendance.signed_out_at is not null then raise exception 'Attendance has already been recorded for this volunteer'; end if;
    if v_open_session.id is not null then raise exception 'Volunteer is currently checked in'; end if;
  else
    if v_attendance.non_attendance_status is null then raise exception 'Volunteer is not marked as withdrawn or absent'; end if;
  end if;

  select public.phaseone_apply_attendance_change(
    p_event_id, p_roster_id, p_action, p_timestamp, p_reason, p_changed_by
  ) into v_result;

  if p_action = 'mark_sign_in' then
    select public.phaseone_open_attendance_session(
      p_event_id, p_roster_id, (v_result->>'signed_in_at')::timestamptz, p_changed_by
    ) into v_session_result;

    v_result := v_result || jsonb_build_object(
      'session_id', v_session_result->>'session_id',
      'continuous', true
    );
  end if;

  return v_result;
end;
$$;

create or replace function public.phaseone_withdraw_volunteer_shifts(
  p_event_id uuid,
  p_roster_id uuid,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.phaseone_roster%rowtype;
  v_row record;
  v_batch_id uuid := gen_random_uuid();
  v_shift_date date;
  v_has_open_session boolean;
  v_total integer := 0;
  v_withdrawn integer := 0;
  v_already_withdrawn integer := 0;
  v_skipped_active integer := 0;
  v_skipped_attendance integer := 0;
  v_skipped_absent integer := 0;
  v_skipped_cancelled integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_outcome text;
begin
  if not exists (select 1 from auth.users where id = p_changed_by) then raise exception 'Staff user not found'; end if;

  select * into v_source
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id
  for update;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  perform 1
  from public.phaseone_roster roster
  where roster.event_id = p_event_id
    and roster.attendance_person_key = v_source.attendance_person_key
  order by roster.id
  for update;

  perform 1
  from public.phaseone_attendance_sessions session_row
  where session_row.event_id = p_event_id
    and session_row.person_key = v_source.attendance_person_key
    and session_row.checked_out_at is null
  order by session_row.id
  for update;

  insert into public.phaseone_attendance (event_id, roster_id)
  select roster.event_id, roster.id
  from public.phaseone_roster roster
  where roster.event_id = p_event_id
    and roster.attendance_person_key = v_source.attendance_person_key
  on conflict (event_id, roster_id) do nothing;

  perform 1
  from public.phaseone_attendance attendance
  join public.phaseone_roster roster
    on roster.id = attendance.roster_id
   and roster.event_id = attendance.event_id
  where roster.event_id = p_event_id
    and roster.attendance_person_key = v_source.attendance_person_key
  order by attendance.roster_id
  for update of attendance;

  for v_row in
    select roster.id as roster_id, roster.timeslot_id, timeslot.status as timeslot_status,
           timeslot.starts_at, attendance.signed_in_at, attendance.signed_out_at,
           attendance.non_attendance_status
    from public.phaseone_roster roster
    join public.phaseone_event_timeslots timeslot
      on timeslot.id = roster.timeslot_id and timeslot.event_id = roster.event_id
    join public.phaseone_attendance attendance
      on attendance.event_id = roster.event_id and attendance.roster_id = roster.id
    where roster.event_id = p_event_id
      and roster.attendance_person_key = v_source.attendance_person_key
    order by timeslot.starts_at, roster.id
  loop
    v_total := v_total + 1;
    v_outcome := null;

    if v_row.timeslot_status = 'cancelled' then
      v_skipped_cancelled := v_skipped_cancelled + 1;
      v_outcome := 'cancelled_shift';
    elsif v_row.non_attendance_status = 'withdrawn' then
      v_already_withdrawn := v_already_withdrawn + 1;
      v_outcome := 'already_withdrawn';
    elsif v_row.non_attendance_status = 'absent' then
      v_skipped_absent := v_skipped_absent + 1;
      v_outcome := 'already_absent';
    elsif v_row.signed_in_at is not null or v_row.signed_out_at is not null then
      v_skipped_attendance := v_skipped_attendance + 1;
      v_outcome := 'attendance_recorded';
    else
      v_shift_date := timezone('Asia/Singapore', v_row.starts_at)::date;
      select exists (
        select 1
        from public.phaseone_attendance_sessions session_row
        where session_row.event_id = p_event_id
          and session_row.person_key = v_source.attendance_person_key
          and session_row.attendance_date = v_shift_date
          and session_row.checked_out_at is null
      ) into v_has_open_session;

      if v_has_open_session then
        v_skipped_active := v_skipped_active + 1;
        v_outcome := 'active_check_in';
      else
        perform public.phaseone_apply_attendance_change(
          p_event_id,
          v_row.roster_id,
          'mark_withdrawn',
          null,
          'Staff bulk withdrawal across event shifts',
          p_changed_by,
          v_batch_id
        );
        v_withdrawn := v_withdrawn + 1;
        v_outcome := 'withdrawn';
      end if;
    end if;

    v_details := v_details || jsonb_build_array(jsonb_build_object(
      'roster_id', v_row.roster_id,
      'timeslot_id', v_row.timeslot_id,
      'outcome', v_outcome
    ));
  end loop;

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'total_shifts', v_total,
    'withdrawn', v_withdrawn,
    'already_withdrawn', v_already_withdrawn,
    'skipped_active_check_in', v_skipped_active,
    'skipped_attendance_recorded', v_skipped_attendance,
    'skipped_absent', v_skipped_absent,
    'skipped_cancelled', v_skipped_cancelled,
    'skipped', v_skipped_active + v_skipped_attendance + v_skipped_absent + v_skipped_cancelled,
    'details', v_details
  );
end;
$$;

revoke all on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid, uuid)
  to service_role;

revoke all on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid)
  to service_role;

revoke all on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)
  to service_role;

revoke all on function public.phaseone_withdraw_volunteer_shifts(uuid, uuid, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_withdraw_volunteer_shifts(uuid, uuid, uuid)
  to service_role;

comment on column public.phaseone_attendance_audit.batch_id is
  'Correlation identifier shared by attendance audit rows created by one bulk staff operation.';

comment on function public.phaseone_withdraw_volunteer_shifts(uuid, uuid, uuid) is
  'Atomically withdraws all still-eligible shifts for one event volunteer, skipping shifts with attendance, absence, cancellation, or an active event-day attendance session.';

commit;
