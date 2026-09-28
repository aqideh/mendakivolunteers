begin;

select plan(8);

insert into auth.users (id, email)
values ('99000000-0000-4000-8000-000000000001', 'gap-uat-staff@example.test');

insert into public.phaseone_events (
  id, title, slug, created_by, updated_by
) values (
  '99000000-0000-4000-8000-000000000010',
  'Continuous gap UAT',
  'continuous-gap-uat',
  '99000000-0000-4000-8000-000000000001',
  '99000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id, event_id, label, starts_at, ends_at, status, sort_order
) values
  (
    '99000000-0000-4000-8000-000000000011',
    '99000000-0000-4000-8000-000000000010',
    'Morning',
    '2026-10-10 09:00:00+08',
    '2026-10-10 11:00:00+08',
    'scheduled',
    0
  ),
  (
    '99000000-0000-4000-8000-000000000012',
    '99000000-0000-4000-8000-000000000010',
    'Overlap',
    '2026-10-10 10:30:00+08',
    '2026-10-10 12:00:00+08',
    'scheduled',
    1
  ),
  (
    '99000000-0000-4000-8000-000000000013',
    '99000000-0000-4000-8000-000000000010',
    'Afternoon gap',
    '2026-10-10 14:00:00+08',
    '2026-10-10 16:00:00+08',
    'scheduled',
    2
  );

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_key, volunteer_name, email, uploaded_by
) values
  (
    '99000000-0000-4000-8000-000000000021',
    '99000000-0000-4000-8000-000000000010',
    '99000000-0000-4000-8000-000000000011',
    'GAP-001',
    'Gap UAT Volunteer',
    'gap-volunteer@example.test',
    '99000000-0000-4000-8000-000000000001'
  ),
  (
    '99000000-0000-4000-8000-000000000022',
    '99000000-0000-4000-8000-000000000010',
    '99000000-0000-4000-8000-000000000012',
    'GAP-001',
    'Gap UAT Volunteer',
    'gap-volunteer@example.test',
    '99000000-0000-4000-8000-000000000001'
  ),
  (
    '99000000-0000-4000-8000-000000000023',
    '99000000-0000-4000-8000-000000000010',
    '99000000-0000-4000-8000-000000000013',
    'GAP-001',
    'Gap UAT Volunteer',
    'gap-volunteer@example.test',
    '99000000-0000-4000-8000-000000000001'
  );

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '99000000-0000-4000-8000-000000000010',
      '99000000-0000-4000-8000-000000000021',
      'mark_sign_in',
      '2026-10-10 09:05:00+08',
      'Continuous gap UAT check-in',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'first shift can be checked in'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_session_shifts linked
    where linked.event_id = '99000000-0000-4000-8000-000000000010'
  ),
  2,
  'continuous session links the origin and overlapping shift only'
);

select ok(
  exists (
    select 1
    from public.phaseone_attendance_session_shifts
    where roster_id = '99000000-0000-4000-8000-000000000022'
  ),
  'overlapping shift is auto-linked'
);

select ok(
  not exists (
    select 1
    from public.phaseone_attendance_session_shifts
    where roster_id = '99000000-0000-4000-8000-000000000023'
  ),
  'gapped shift is not auto-linked'
);

set local role service_role;

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '99000000-0000-4000-8000-000000000010',
      '99000000-0000-4000-8000-000000000023',
      'mark_sign_in',
      '2026-10-10 14:00:00+08',
      'Gap should require checkout',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer must check out of the earlier shift before checking in to a separated shift',
  'gapped shift cannot reuse the earlier open attendance session'
);

select throws_ok(
  $$
    select public.phaseone_extend_attendance_session(
      '99000000-0000-4000-8000-000000000010',
      '99000000-0000-4000-8000-000000000021',
      '99000000-0000-4000-8000-000000000013',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'A shift extension requires an adjacent or overlapping shift',
  'on-site shift extension cannot bridge a gap'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '99000000-0000-4000-8000-000000000010',
      '99000000-0000-4000-8000-000000000021',
      'mark_sign_out',
      '2026-10-10 12:00:00+08',
      'Close connected morning session',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'connected morning session can be checked out'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '99000000-0000-4000-8000-000000000010',
      '99000000-0000-4000-8000-000000000023',
      'mark_sign_in',
      '2026-10-10 14:00:00+08',
      'Start new session after gap',
      '99000000-0000-4000-8000-000000000001'
    )
  $$,
  'gapped shift can start a new session after checkout'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_sessions
    where event_id = '99000000-0000-4000-8000-000000000010'
      and person_key = 'id:gap-001'
  ),
  2,
  'gapped attendance creates two separate event-day sessions'
);

select * from finish();
rollback;
