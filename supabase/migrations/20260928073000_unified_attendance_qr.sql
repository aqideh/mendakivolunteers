begin;

alter table public.phaseone_attendance_qr_sessions
  drop constraint if exists phaseone_attendance_qr_sessions_action_check;

alter table public.phaseone_attendance_qr_sessions
  add constraint phaseone_attendance_qr_sessions_action_check
  check (action in ('attendance', 'check_in', 'check_out'));

comment on column public.phaseone_attendance_qr_sessions.action is
  'Attendance QR mode. New Keluarga flows use attendance; legacy check_in/check_out values remain accepted for historical compatibility.';

commit;
