begin;

select plan(7);

insert into auth.users (id, email)
values ('99100000-0000-4000-8000-000000000001', 'qr-gap-staff@example.test');

insert into public.phaseone_events (id,title,slug,created_by,updated_by)
values (
  '99100000-0000-4000-8000-000000000010',
  'QR continuous gap UAT',
  'qr-continuous-gap-uat',
  '99100000-0000-4000-8000-000000000001',
  '99100000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id,event_id,label,starts_at,ends_at,status,sort_order)
values
  ('99100000-0000-4000-8000-000000000011','99100000-0000-4000-8000-000000000010','Morning','2026-10-11 09:00:00+08','2026-10-11 11:00:00+08','scheduled',0),
  ('99100000-0000-4000-8000-000000000012','99100000-0000-4000-8000-000000000010','Adjacent','2026-10-11 11:00:00+08','2026-10-11 12:00:00+08','scheduled',1),
  ('99100000-0000-4000-8000-000000000013','99100000-0000-4000-8000-000000000010','Afternoon gap','2026-10-11 14:00:00+08','2026-10-11 16:00:00+08','scheduled',2);

insert into public.phaseone_roster (id,event_id,timeslot_id,volunteer_key,volunteer_name,email,uploaded_by)
values
  ('99100000-0000-4000-8000-000000000021','99100000-0000-4000-8000-000000000010','99100000-0000-4000-8000-000000000011','QRGAP-001','QR Gap Volunteer','qr-gap-volunteer@example.test','99100000-0000-4000-8000-000000000001'),
  ('99100000-0000-4000-8000-000000000022','99100000-0000-4000-8000-000000000010','99100000-0000-4000-8000-000000000012','QRGAP-001','QR Gap Volunteer','qr-gap-volunteer@example.test','99100000-0000-4000-8000-000000000001'),
  ('99100000-0000-4000-8000-000000000023','99100000-0000-4000-8000-000000000010','99100000-0000-4000-8000-000000000013','QRGAP-001','QR Gap Volunteer','qr-gap-volunteer@example.test','99100000-0000-4000-8000-000000000001');

select is(
  (public.phaseone_apply_qr_attendance(
    '99100000-0000-4000-8000-000000000010',
    '99100000-0000-4000-8000-000000000021',
    'check_in',
    '2026-10-11 09:05:00+08'
  )->>'status'),
  'checked_in',
  'QR check-in opens the first attendance session'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_session_shifts
    where event_id='99100000-0000-4000-8000-000000000010'
  ),
  2,
  'QR session auto-links only origin and adjacent shift'
);

select ok(
  not exists (
    select 1 from public.phaseone_attendance_session_shifts
    where roster_id='99100000-0000-4000-8000-000000000023'
  ),
  'QR check-in does not auto-link gapped shift'
);

select throws_ok(
  $$
    select public.phaseone_apply_qr_attendance(
      '99100000-0000-4000-8000-000000000010',
      '99100000-0000-4000-8000-000000000023',
      'check_in',
      '2026-10-11 14:00:00+08'
    )
  $$,
  'P0001',
  'Volunteer must check out of the earlier shift before checking in to a separated shift',
  'QR gapped shift requires checkout before a new check-in'
);

select is(
  (public.phaseone_apply_qr_attendance(
    '99100000-0000-4000-8000-000000000010',
    '99100000-0000-4000-8000-000000000021',
    'check_out',
    '2026-10-11 12:00:00+08'
  )->>'status'),
  'checked_out',
  'QR checkout closes the connected morning session'
);

select is(
  (public.phaseone_apply_qr_attendance(
    '99100000-0000-4000-8000-000000000010',
    '99100000-0000-4000-8000-000000000023',
    'check_in',
    '2026-10-11 14:00:00+08'
  )->>'status'),
  'checked_in',
  'QR gapped shift starts a fresh session after checkout'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_attendance_sessions
    where event_id='99100000-0000-4000-8000-000000000010'
      and person_key='id:qrgap-001'
  ),
  2,
  'QR attendance records two sessions across the gap'
);

select * from finish();
rollback;
