alter table public.phaseone_attendance
  add column non_attendance_status text,
  add column non_attendance_marked_by uuid references auth.users(id),
  add column non_attendance_marked_at timestamptz;

alter table public.phaseone_attendance
  add constraint phaseone_attendance_non_attendance_status_check
    check (non_attendance_status is null or non_attendance_status in ('withdrawn', 'absent')),
  add constraint phaseone_attendance_non_attendance_exclusive_check
    check (
      non_attendance_status is null
      or (signed_in_at is null and signed_out_at is null)
    ),
  add constraint phaseone_attendance_non_attendance_marker_check
    check (
      (non_attendance_status is null and non_attendance_marked_by is null and non_attendance_marked_at is null)
      or
      (non_attendance_status is not null and non_attendance_marked_by is not null and non_attendance_marked_at is not null)
    );

alter table public.phaseone_attendance_audit
  drop constraint if exists phaseone_attendance_audit_action_check;

alter table public.phaseone_attendance_audit
  add constraint phaseone_attendance_audit_action_check
    check (
      action in (
        'mark_sign_in',
        'mark_sign_out',
        'clear_sign_in',
        'clear_sign_out',
        'mark_withdrawn',
        'mark_absent',
        'clear_non_attendance'
      )
    ),
  add column old_non_attendance_status text,
  add column new_non_attendance_status text;

alter table public.phaseone_attendance_audit
  add constraint phaseone_attendance_audit_old_non_attendance_status_check
    check (old_non_attendance_status is null or old_non_attendance_status in ('withdrawn', 'absent')),
  add constraint phaseone_attendance_audit_new_non_attendance_status_check
    check (new_non_attendance_status is null or new_non_attendance_status in ('withdrawn', 'absent'));

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
  if p_action not in (
    'mark_sign_in',
    'mark_sign_out',
    'clear_sign_in',
    'clear_sign_out',
    'mark_withdrawn',
    'mark_absent',
    'clear_non_attendance'
  ) then
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

  if p_action in ('mark_sign_in', 'mark_sign_out', 'clear_sign_in', 'clear_sign_out')
    and v_attendance.non_attendance_status is not null then
    raise exception 'Clear the volunteer non-attendance status before changing check-in or check-out';
  end if;
  if p_action in ('mark_withdrawn', 'mark_absent')
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
      non_attendance_status = case
        when p_action = 'mark_withdrawn' then 'withdrawn'
        when p_action = 'mark_absent' then 'absent'
        when p_action = 'clear_non_attendance' then null
        else non_attendance_status
      end,
      non_attendance_marked_by = case
        when p_action in ('mark_withdrawn', 'mark_absent') then p_changed_by
        when p_action = 'clear_non_attendance' then null
        else non_attendance_marked_by
      end,
      non_attendance_marked_at = case
        when p_action in ('mark_withdrawn', 'mark_absent') then v_effective_timestamp
        when p_action = 'clear_non_attendance' then null
        else non_attendance_marked_at
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
    old_non_attendance_status,
    new_non_attendance_status,
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
    v_attendance.non_attendance_status,
    v_updated.non_attendance_status,
    p_changed_by
  );

  return jsonb_build_object(
    'attendance_id', v_updated.id,
    'signed_in_at', v_updated.signed_in_at,
    'signed_out_at', v_updated.signed_out_at,
    'non_attendance_status', v_updated.non_attendance_status,
    'non_attendance_marked_at', v_updated.non_attendance_marked_at,
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
  if p_action not in (
    'mark_sign_in',
    'mark_sign_out',
    'mark_withdrawn',
    'mark_absent',
    'clear_non_attendance'
  ) then
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
    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status;
    end if;
    if v_attendance.signed_in_at is not null then
      raise exception 'Volunteer is already checked in';
    end if;
    if v_attendance.signed_out_at is not null then
      raise exception 'Cannot check in after check-out has been recorded';
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
  else
    if v_attendance.non_attendance_status is null then
      raise exception 'Volunteer is not marked as withdrawn or absent';
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
