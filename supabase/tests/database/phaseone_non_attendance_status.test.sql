begin;

select plan(14);

insert into auth.users (id, email)
values ('73000000-0000-4000-8000-000000000001', 'non-attendance-staff@example.test');

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '73000000-0000-4000-8000-000000000002',
  'Non-attendance status test',
  'non-attendance-status-test',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '73000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-08-29 01:00:00+00'
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
    '73000000-0000-4000-8000-000000000004',
    '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000003',
    'MV-WITHDRAWN',
    'Withdrawn Volunteer',
    'withdrawn@example.test',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73000000-0000-4000-8000-000000000005',
    '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000003',
    'MV-ABSENT',
    'Absent Volunteer',
    'absent@example.test',
    '73000000-0000-4000-8000-000000000001'
  ),
  (
    '73000000-0000-4000-8000-000000000006',
    '73000000-0000-4000-8000-000000000002',
    '73000000-0000-4000-8000-000000000003',
    'MV-CHECKEDIN',
    'Checked In Volunteer',
    'checkedin@example.test',
    '73000000-0000-4000-8000-000000000001'
  );

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000004',
      'mark_withdrawn',
      null,
      'Staff marked volunteer as withdrawn',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'staff can mark a pending roster volunteer as withdrawn'
);

select is(
  (select non_attendance_status from public.phaseone_attendance where roster_id = '73000000-0000-4000-8000-000000000004'),
  'withdrawn',
  'withdrawn status is persisted'
);

select ok(
  exists (
    select 1
    from public.phaseone_attendance
    where roster_id = '73000000-0000-4000-8000-000000000004'
      and signed_in_at is null
      and signed_out_at is null
      and non_attendance_marked_by = '73000000-0000-4000-8000-000000000001'
      and non_attendance_marked_at is not null
  ),
  'withdrawn status remains mutually exclusive with check-in timestamps and records who marked it'
);

select is(
  (select action from public.phaseone_attendance_audit where roster_id = '73000000-0000-4000-8000-000000000004' order by changed_at desc limit 1),
  'mark_withdrawn',
  'withdrawn action is recorded in the immutable audit trail'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000004',
      'mark_sign_in',
      null,
      'Attempt check-in while withdrawn',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer is marked as withdrawn',
  'withdrawn volunteer cannot be checked in until the status is cleared'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000004',
      'clear_non_attendance',
      null,
      'Staff cleared volunteer non-attendance status',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'staff can undo a withdrawn or absent status'
);

select is(
  (select non_attendance_status from public.phaseone_attendance where roster_id = '73000000-0000-4000-8000-000000000004'),
  null,
  'clearing non-attendance restores the volunteer to a pending state'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000004',
      'mark_sign_in',
      null,
      'Staff check-in after status cleared',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'a volunteer can check in after non-attendance status is cleared'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000005',
      'mark_absent',
      null,
      'Staff marked volunteer as absent',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'staff can mark a pending roster volunteer as absent'
);

select is(
  (select non_attendance_status from public.phaseone_attendance where roster_id = '73000000-0000-4000-8000-000000000005'),
  'absent',
  'absent status is persisted separately from withdrawn'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000005',
      'mark_withdrawn',
      null,
      'Attempt to replace absent directly',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer is already marked as absent',
  'one non-attendance status cannot silently overwrite another'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000006',
      'mark_sign_in',
      null,
      'Staff check-in',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'control volunteer can be checked in normally'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '73000000-0000-4000-8000-000000000002',
      '73000000-0000-4000-8000-000000000006',
      'mark_absent',
      null,
      'Attempt absent after check-in',
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Attendance has already been recorded for this volunteer',
  'checked-in volunteer cannot be marked absent'
);

select throws_ok(
  $$
    update public.phaseone_attendance
    set non_attendance_status = 'withdrawn',
        non_attendance_marked_by = '73000000-0000-4000-8000-000000000001',
        non_attendance_marked_at = now()
    where roster_id = '73000000-0000-4000-8000-000000000006'
  $$,
  '23514',
  null,
  'database constraint rejects non-attendance status when check-in exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)',
    'EXECUTE'
  ),
  'authenticated browser clients still cannot execute staff attendance transitions directly'
);

select * from finish();
rollback;
