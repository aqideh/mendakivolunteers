-- A full-day uniqueness index added in the MakLom workspace migration blocks
-- legitimate separate attendance sessions for non-adjacent shifts. A volunteer
-- can close the morning session then start a new afternoon session on the same
-- event day. The partial uniqueness index already forbids two OPEN sessions.
--
-- Keep the audit-aware reuse of a voided session in
-- phaseone_open_attendance_session and preserve the stronger invariant that
-- no volunteer has two simultaneously open event-day sessions.
do $$
begin
  if to_regclass('public.phaseone_attendance_sessions_one_open_idx') is null
     or pg_get_indexdef('public.phaseone_attendance_sessions_one_open_idx'::regclass)
        not ilike '%where (checked_out_at is null)%' then
    raise exception 'Partial unique open-session index must exist before removing day-level uniqueness';
  end if;
end $$;

drop index if exists public.phaseone_attendance_sessions_event_person_day_uidx;
