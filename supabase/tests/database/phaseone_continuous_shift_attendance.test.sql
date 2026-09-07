begin;

select plan(24);

select has_column(
  'public',
  'phaseone_roster',
  'attendance_person_key',
  'roster rows have a stable event-day attendance identity'
);

select has_table(
  'public',
  'phaseone_attendance_sessions',
  'continuous event-day attendance sessions exist'
);

select has_table(
  'public',
  'phaseone_attendance_session_shifts',
  'attendance sessions can link multiple shift assignments'
);

select has_view(
  'public',
  'phaseone_attendance_effective',
  'effective attendance read model exists'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot extend attendance sessions'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot directly extend attendance sessions'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid)',
    'EXECUTE'
  ),
  'service role can extend attendance sessions'
);

insert into auth.users (id, email)
values (
  '76000000-0000-4000-8000-000000000001',
  'continuous-attendance-staff@example.test'
);

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '76000000-0000-4000-8000-000000000002',
  'Continuous attendance test',
  'continuous-attendance-test',
  '76000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  sort_order
)
values
  (
    '76000000-0000-4000-8000-000000000003',
    '76000000-0000-4000-8000-000000000002',
    'AM',
    '2026-09-07 01:00:00+00',
    '2026-09-07 05:00:00+00',
    1
  ),
  (
    '76000000-0000-4000-8000-000000000004',
    '76000000-0000-4000-8000-000000000002',
    'PM',
    '2026-09-07 05:00:00+00',
    '2026-09-07 09:00:00+00',
    2
  );

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_key,
  volunteer_name,
  email,
  uploaded_by
)
values
  (
    '76000000-0000-4000-8000-000000000010',
    '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000003',
    'MV-1001',
    'Scheduled Both Shifts',
    'both-shifts@example.test',
    '76000000-0000-4000-8000-000000000001'
  ),
  (
    '76000000-0000-4000-8000-000000000011',
    '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000004',
    'MV-1001',
    'Scheduled Both Shifts',
    'both-shifts@example.test',
    '76000000-0000-4000-8000-000000000001'
  ),
  (
    '76000000-0000-4000-8000-000000000020',
    '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000003',
    null,
    'Spontaneous Extension',
    'stay-longer@example.test',
    '76000000-0000-4000-8000-000000000001'
  );

select is(
  (
    select attendance_person_key
    from public.phaseone_roster
    where id = '76000000-0000-4000-8000-000000000010'
  ),
  'id:mv-1001',
  'volunteer ID is the preferred continuous-attendance identity'
);

select is(
  (
    select attendance_person_key
    from public.phaseone_roster
    where id = '76000000-0000-4000-8000-000000000011'
  ),
  'id:mv-1001',
  'same volunteer ID links roster assignments across shifts'
);

select public.phaseone_apply_attendance_transition(
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000010',
  'mark_sign_in',
  '2026-09-07 00:45:00+00',
  'Test scheduled AM check-in',
  '76000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_sessions
    where event_id = '76000000-0000-4000-8000-000000000002'
      and person_key = 'id:mv-1001'
      and checked_out_at is null
  ),
  1,
  'AM check-in opens exactly one event-day attendance session'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_session_shifts shifts
    join public.phaseone_attendance_sessions sessions on sessions.id = shifts.session_id
    where sessions.event_id = '76000000-0000-4000-8000-000000000002'
      and sessions.person_key = 'id:mv-1001'
  ),
  2,
  'scheduled AM and PM roster rows are linked into the same session'
);

select is(
  (
    select continuation_type
    from public.phaseone_attendance_effective
    where roster_id = '76000000-0000-4000-8000-000000000011'
  ),
  'scheduled',
  'PM assignment is marked as a scheduled continuation'
);

select is(
  (
    select signed_in_at
    from public.phaseone_attendance_effective
    where roster_id = '76000000-0000-4000-8000-000000000011'
  ),
  '2026-09-07 00:45:00+00'::timestamptz,
  'PM effective status inherits the original AM check-in timestamp'
);

select ok(
  not exists (
    select 1
    from public.phaseone_attendance
    where roster_id = '76000000-0000-4000-8000-000000000011'
  ),
  'automatic carry-over does not write a synthetic PM attendance record'
);

create temporary table continuous_results (
  label text primary key,
  result jsonb not null
);

insert into continuous_results (label, result)
select
  'pm_sign_in',
  public.phaseone_apply_attendance_transition(
    '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000011',
    'mark_sign_in',
    '2026-09-07 05:05:00+00',
    'Test PM duplicate check-in',
    '76000000-0000-4000-8000-000000000001'
  );

select is(
  (select (result->>'already_on_site')::boolean from continuous_results where label = 'pm_sign_in'),
  true,
  'a PM check-in attempt recognizes the volunteer is already on site'
);

select ok(
  (
    select signed_in_at is null
    from public.phaseone_attendance
    where roster_id = '76000000-0000-4000-8000-000000000011'
  ),
  'PM check-in attempt still does not fabricate a second physical check-in timestamp'
);

select public.phaseone_apply_attendance_transition(
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000011',
  'mark_sign_out',
  '2026-09-07 09:15:00+00',
  'Test final PM check-out',
  '76000000-0000-4000-8000-000000000001'
);

select is(
  (
    select checked_out_at
    from public.phaseone_attendance_sessions
    where event_id = '76000000-0000-4000-8000-000000000002'
      and person_key = 'id:mv-1001'
  ),
  '2026-09-07 09:15:00+00'::timestamptz,
  'PM check-out closes the whole event-day session'
);

select is(
  (
    select signed_out_at
    from public.phaseone_attendance
    where roster_id = '76000000-0000-4000-8000-000000000010'
  ),
  '2026-09-07 09:15:00+00'::timestamptz,
  'origin AM attendance row receives the final event-day check-out'
);

select is(
  (
    select signed_out_at
    from public.phaseone_attendance_effective
    where roster_id = '76000000-0000-4000-8000-000000000011'
  ),
  '2026-09-07 09:15:00+00'::timestamptz,
  'PM effective attendance exposes the same final event-day check-out'
);

select public.phaseone_apply_attendance_transition(
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000020',
  'mark_sign_in',
  '2026-09-07 01:10:00+00',
  'Test spontaneous AM check-in',
  '76000000-0000-4000-8000-000000000001'
);

insert into continuous_results (label, result)
select
  'extension',
  public.phaseone_extend_attendance_session(
    '76000000-0000-4000-8000-000000000002',
    '76000000-0000-4000-8000-000000000020',
    '76000000-0000-4000-8000-000000000004',
    '76000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from continuous_results where label = 'extension'),
  'extended',
  'staff can extend a checked-in AM volunteer into PM'
);

select ok(
  exists (
    select 1
    from public.phaseone_roster
    where id = (
      select (result->>'target_roster_id')::uuid
      from continuous_results
      where label = 'extension'
    )
      and timeslot_id = '76000000-0000-4000-8000-000000000004'
      and attendance_person_key = 'email:stay-longer@example.test'
  ),
  'extension creates a PM roster assignment using the same safe event-day identity'
);

select is(
  (
    select continuation_type
    from public.phaseone_attendance_effective
    where roster_id = (
      select (result->>'target_roster_id')::uuid
      from continuous_results
      where label = 'extension'
    )
  ),
  'extended_on_site',
  'spontaneous PM assignment is labelled as an on-site extension'
);

select is(
  (
    select signed_in_at
    from public.phaseone_attendance_effective
    where roster_id = (
      select (result->>'target_roster_id')::uuid
      from continuous_results
      where label = 'extension'
    )
  ),
  '2026-09-07 01:10:00+00'::timestamptz,
  'extended PM assignment inherits the original event-day check-in'
);

select ok(
  exists (
    select 1
    from public.phaseone_attendance_session_audit
    where event_id = '76000000-0000-4000-8000-000000000002'
      and action = 'shift_extended'
      and roster_id = (
        select (result->>'target_roster_id')::uuid
        from continuous_results
        where label = 'extension'
      )
  ),
  'shift extension is audit logged'
);

select public.phaseone_open_attendance_session(
  '76000000-0000-4000-8000-000000000002',
  '76000000-0000-4000-8000-000000000020',
  '2026-09-07 01:10:00+00',
  '76000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_sessions
    where event_id = '76000000-0000-4000-8000-000000000002'
      and person_key = 'email:stay-longer@example.test'
      and checked_out_at is null
  ),
  1,
  'reopening an active event-day session is idempotent'
);

select * from finish();
rollback;
