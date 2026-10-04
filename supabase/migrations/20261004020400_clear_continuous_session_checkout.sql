begin;

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
    'session_reopened'
  ));

create or replace function public.phaseone_reopen_session_after_checkout_correction()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_session public.phaseone_attendance_sessions%rowtype;
  v_cleared_attendance_rows integer := 0;
begin
  if new.action <> 'clear_sign_out' then
    return new;
  end if;

  select session.*
  into v_session
  from public.phaseone_attendance_sessions session
  join public.phaseone_attendance_session_shifts shift_link
    on shift_link.session_id = session.id
  where session.event_id = new.event_id
    and shift_link.roster_id = new.roster_id
    and session.checked_out_at = new.old_signed_out_at
  order by session.checked_out_at desc
  limit 1
  for update of session;

  if not found then
    return new;
  end if;

  update public.phaseone_attendance_sessions
  set checked_out_at = null,
      checked_out_by = null,
      updated_at = now()
  where id = v_session.id;

  update public.phaseone_attendance attendance
  set signed_out_at = null,
      signed_out_marked_by = null,
      updated_at = now()
  where attendance.event_id = new.event_id
    and attendance.signed_out_at = v_session.checked_out_at
    and exists (
      select 1
      from public.phaseone_attendance_session_shifts shift_link
      where shift_link.session_id = v_session.id
        and shift_link.roster_id = attendance.roster_id
    );

  get diagnostics v_cleared_attendance_rows = row_count;

  insert into public.phaseone_attendance_session_audit (
    session_id,
    event_id,
    roster_id,
    action,
    metadata,
    changed_by
  ) values (
    v_session.id,
    new.event_id,
    new.roster_id,
    'session_reopened',
    jsonb_build_object(
      'reason', new.reason,
      'previous_checked_out_at', v_session.checked_out_at,
      'cleared_attendance_rows', v_cleared_attendance_rows,
      'source', 'attendance_correction'
    ),
    new.changed_by
  );

  return new;
end;
$$;

drop trigger if exists phaseone_reopen_session_after_checkout_correction
  on public.phaseone_attendance_audit;

create trigger phaseone_reopen_session_after_checkout_correction
after insert on public.phaseone_attendance_audit
for each row
when (new.action = 'clear_sign_out')
execute function public.phaseone_reopen_session_after_checkout_correction();

revoke all on function public.phaseone_reopen_session_after_checkout_correction()
  from public, anon, authenticated;
grant execute on function public.phaseone_reopen_session_after_checkout_correction()
  to service_role;

commit;
