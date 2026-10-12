begin;
select plan(2);

select ok(
  to_regclass('public.phaseone_attendance_sessions_event_person_day_uidx') is null,
  'A completed attendance session does not block a later session on the same day'
);

select ok(
  to_regclass('public.phaseone_attendance_sessions_one_open_idx') is not null
  and pg_get_indexdef('public.phaseone_attendance_sessions_one_open_idx'::regclass)
      ilike '%where (checked_out_at is null)%',
  'Two simultaneously open attendance sessions remain prevented by a unique partial index'
);

select * from finish();
rollback;
