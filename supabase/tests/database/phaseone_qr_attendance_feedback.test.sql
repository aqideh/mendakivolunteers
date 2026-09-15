begin;

select plan(12);

select has_table('public', 'phaseone_attendance_qr_sessions', 'QR session table exists');
select has_table('public', 'phaseone_event_feedback', 'event feedback table exists');

select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'phaseone_attendance_qr_sessions'),
  'QR sessions have RLS enabled'
);
select ok(
  (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relname = 'phaseone_event_feedback'),
  'event feedback has RLS enabled'
);
select ok(not has_table_privilege('anon', 'public.phaseone_attendance_qr_sessions', 'SELECT'), 'anonymous clients cannot read QR tokens');
select ok(not has_table_privilege('authenticated', 'public.phaseone_event_feedback', 'SELECT'), 'authenticated clients cannot directly read event feedback');
select ok(has_table_privilege('service_role', 'public.phaseone_event_feedback', 'SELECT'), 'service role can read event feedback');
select ok(
  has_function_privilege('service_role', 'public.phaseone_apply_qr_attendance(uuid,uuid,text,timestamp with time zone)', 'EXECUTE'),
  'service role can execute QR attendance transaction'
);
select ok(
  not has_function_privilege('authenticated', 'public.phaseone_apply_qr_attendance(uuid,uuid,text,timestamp with time zone)', 'EXECUTE'),
  'authenticated browser clients cannot execute QR attendance transaction'
);

insert into auth.users (id, email)
values ('79000000-0000-4000-8000-000000000001', 'qr-staff@example.test');

insert into public.phaseone_events (id, title, slug, created_by, updated_by)
values (
  '79000000-0000-4000-8000-000000000002',
  'QR attendance test',
  'qr-attendance-test',
  '79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id, event_id, label, starts_at, ends_at)
values (
  '79000000-0000-4000-8000-000000000003',
  '79000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-09-15 01:00:00+00',
  '2026-09-15 05:00:00+00'
);

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_key, volunteer_name, email, mobile, uploaded_by
) values (
  '79000000-0000-4000-8000-000000000004',
  '79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003',
  'QR-001',
  'QR Volunteer',
  'qr-volunteer@example.test',
  '91234567',
  '79000000-0000-4000-8000-000000000001'
);

select is(
  (public.phaseone_apply_qr_attendance(
    '79000000-0000-4000-8000-000000000002',
    '79000000-0000-4000-8000-000000000004',
    'check_in',
    '2026-09-15 01:05:00+00'
  )->>'status'),
  'checked_in',
  'QR check-in opens attendance'
);

select is(
  (select source_type from public.phaseone_attendance_audit where roster_id = '79000000-0000-4000-8000-000000000004' and action = 'mark_sign_in' order by changed_at desc limit 1),
  'volunteer_qr',
  'QR attendance has explicit audit provenance'
);

select is(
  (public.phaseone_apply_qr_attendance(
    '79000000-0000-4000-8000-000000000002',
    '79000000-0000-4000-8000-000000000004',
    'check_out',
    '2026-09-15 05:03:00+00'
  )->>'status'),
  'checked_out',
  'QR check-out closes continuous attendance'
);

select * from finish();
rollback;
