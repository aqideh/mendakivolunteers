-- Keep continuous attendance, roster corrections, and MakLom contributions consistent.
-- Clearing the actual originating check-in voids the corresponding session
-- (only when no linked shift has physical attendance) and retains its audit history.

alter table public.phaseone_attendance_session_audit
  drop constraint phaseone_attendance_session_audit_action_check;

alter table public.phaseone_attendance_session_audit
  add constraint phaseone_attendance_session_audit_action_check
  check (action in (
    'session_opened',
    'scheduled_shifts_linked',
    'shift_extended',
    'session_closed',
    'session_backfilled',
    'session_reopened',
    'session_voided'
  ));

create or replace function public.phaseone_void_empty_origin_session(
  p_event_id uuid,
  p_roster_id uuid,
  p_expected_checked_in_at timestamptz,
  p_changed_by uuid,
  p_reason text
)
returns boolean
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
declare
  v_session public.phaseone_attendance_sessions%rowtype;
  v_detached_shifts integer := 0;
begin
  if p_expected_checked_in_at is null or length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'An original check-in and audit reason are required';
  end if;

  select s.* into v_session
  from public.phaseone_attendance_sessions s
  join public.phaseone_attendance_session_shifts l
    on l.session_id = s.id and l.roster_id = p_roster_id
  where s.event_id = p_event_id
    and s.origin_roster_id = p_roster_id
    and s.checked_in_at = p_expected_checked_in_at
    and s.checked_out_at is null
  order by s.created_at desc
  limit 1
  for update of s;

  if not found then
    return false;
  end if;

  -- Never erase another shift's actual attendance, including a later checkout.
  if exists (
    select 1 from public.phaseone_attendance_session_shifts l
    join public.phaseone_attendance a
      on a.event_id = l.event_id and a.roster_id = l.roster_id
    where l.session_id = v_session.id
      and (a.signed_in_at is not null or a.signed_out_at is not null)
  ) then
    raise exception 'Clear actual attendance on other linked shifts before clearing the originating check-in';
  end if;

  if not exists (
    select 1 from public.phaseone_attendance_audit a
    where a.event_id = p_event_id
      and a.roster_id = p_roster_id
      and a.action = 'clear_sign_in'
      and a.old_signed_in_at = v_session.checked_in_at
      and a.new_signed_in_at is null
  ) then
    raise exception 'A recorded check-in correction is required before the session can be voided';
  end if;

  if exists (
    select 1 from public.volunteer_contributions c
    where c.attendance_session_id = v_session.id
      and (c.status in ('approved', 'needs_review') or c.approved_minutes is not null)
  ) then
    raise exception 'MakLom has reviewed this attendance. Resolve the contribution review before voiding the check-in';
  end if;

  -- The session row is kept as zero-duration history, not an active attendance.
  -- Removing its shift links prevents the effective attendance view inheriting it.
  update public.phaseone_attendance_sessions
  set checked_out_at = checked_in_at,
      checked_out_by = p_changed_by,
      updated_at = now()
  where id = v_session.id;

  delete from public.phaseone_attendance_session_shifts
  where session_id = v_session.id;
  get diagnostics v_detached_shifts = row_count;

  -- Closing a session automatically stages a MakLom contribution. Voided
  -- attendance must not be left as a pending contribution, even for zero minutes.
  update public.volunteer_contributions
  set status = 'rejected',
      operational_minutes = 0,
      approved_minutes = null,
      approved_by = null,
      approved_at = null,
      approval_note = left('Voided originating attendance: ' || btrim(p_reason), 500),
      updated_at = now()
  where attendance_session_id = v_session.id
    and status in ('pending', 'rejected');

  insert into public.phaseone_attendance_session_audit (
    session_id, event_id, roster_id, action, metadata, changed_by
  ) values (
    v_session.id, p_event_id, p_roster_id, 'session_voided',
    jsonb_build_object(
      'reason', btrim(p_reason),
      'original_checked_in_at', v_session.checked_in_at,
      'detached_shift_count', v_detached_shifts,
      'source', 'clear_origin_check_in'
    ),
    p_changed_by
  );

  return true;
end;
$function$;

-- This helper must never be invoked by a volunteer browser session.
revoke all on function public.phaseone_void_empty_origin_session(
  uuid, uuid, timestamptz, uuid, text
) from public, anon, authenticated;
grant execute on function public.phaseone_void_empty_origin_session(
  uuid, uuid, timestamptz, uuid, text
) to service_role;

create or replace function public.phaseone_void_session_after_checkin_correction()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $function$
begin
  if new.action = 'clear_sign_in'
     and new.old_signed_in_at is not null
     and new.new_signed_in_at is null then
    perform public.phaseone_void_empty_origin_session(
      new.event_id,
      new.roster_id,
      new.old_signed_in_at,
      new.changed_by,
      new.reason
    );
  end if;
  return new;
end;
$function$;

drop trigger if exists phaseone_void_session_after_checkin_correction
  on public.phaseone_attendance_audit;

create trigger phaseone_void_session_after_checkin_correction
after insert on public.phaseone_attendance_audit
for each row when (new.action = 'clear_sign_in')
execute function public.phaseone_void_session_after_checkin_correction();

revoke all on function public.phaseone_void_session_after_checkin_correction()
  from public, anon, authenticated;
grant execute on function public.phaseone_void_session_after_checkin_correction()
  to service_role;

-- The day-level uniqueness constraint is preserved. Only an audited, fully
-- voided and unlinked session can be reset when the volunteer checks in again.
CREATE OR REPLACE FUNCTION public.phaseone_open_attendance_session(p_event_id uuid, p_roster_id uuid, p_checked_in_at timestamp with time zone, p_changed_by uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
    -- A previous mistaken check-in may have been voided. Reuse that empty
    -- history row because the event/person/day identity is intentionally unique.
    select s.* into v_session
    from public.phaseone_attendance_sessions s
    where s.event_id = p_event_id
      and s.attendance_date = v_date
      and s.person_key = v_roster.attendance_person_key
      and s.checked_out_at = s.checked_in_at
      and not exists (
        select 1 from public.phaseone_attendance_session_shifts link
        where link.session_id = s.id
      )
      and exists (
        select 1 from public.phaseone_attendance_session_audit audit
        where audit.session_id = s.id and audit.action = 'session_voided'
      )
    limit 1
    for update of s;

    if found then
      update public.phaseone_attendance_sessions
      set origin_roster_id = p_roster_id,
          checked_in_at = p_checked_in_at,
          checked_out_at = null,
          checked_in_by = p_changed_by,
          checked_out_by = null,
          updated_at = now()
      where id = v_session.id
      returning * into v_session;
      v_created := true;
    else
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
$function$
;
