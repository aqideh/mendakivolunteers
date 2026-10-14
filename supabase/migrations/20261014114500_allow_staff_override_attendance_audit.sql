-- Bring the attendance session audit constraint into line with the MakLom correction RPC.
-- Every existing action remains permitted; staff_override is an explicitly audited edit.
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
    'session_voided',
    'staff_override'
  ));
