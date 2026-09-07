begin;

select plan(2);

insert into auth.users (id, email)
values ('76100000-0000-4000-8000-000000000001', 'early-checkout-staff@example.test');

insert into public.phaseone_events (id, title, slug, created_by, updated_by)
values (
  '76100000-0000-4000-8000-000000000002',
  'Early checkout test',
  'early-checkout-test',
  '76100000-0000-4000-8000-000000000001',
  '76100000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id, event_id, label, starts_at, ends_at, sort_order)
values
  ('76100000-0000-4000-8000-000000000003', '76100000-0000-4000-8000-000000000002', 'AM', '2026-09-07 01:00:00+00', '2026-09-07 04:30:00+00', 1),
  ('76100000-0000-4000-8000-000000000004', '76100000-0000-4000-8000-000000000002', 'PM', '2026-09-07 05:00:00+00', '2026-09-07 09:00:00+00', 2);

insert into public.phaseone_roster (id, event_id, timeslot_id, volunteer_key, volunteer_name, email, uploaded_by)
values
  ('76100000-0000-4000-8000-000000000010', '76100000-0000-4000-8000-000000000002', '76100000-0000-4000-8000-000000000003', 'MV-2001', 'Leaves After AM', 'leaves-am@example.test', '76100000-0000-4000-8000-000000000001'),
  ('76100000-0000-4000-8000-000000000011', '76100000-0000-4000-8000-000000000002', '76100000-0000-4000-8000-000000000004', 'MV-2001', 'Leaves After AM', 'leaves-am@example.test', '76100000-0000-4000-8000-000000000001');

select public.phaseone_apply_attendance_transition(
  '76100000-0000-4000-8000-000000000002',
  '76100000-0000-4000-8000-000000000010',
  'mark_sign_in',
  '2026-09-07 00:45:00+00',
  'Test AM arrival',
  '76100000-0000-4000-8000-000000000001'
);

select public.phaseone_apply_attendance_transition(
  '76100000-0000-4000-8000-000000000002',
  '76100000-0000-4000-8000-000000000010',
  'mark_sign_out',
  '2026-09-07 04:45:00+00',
  'Test leaving before PM',
  '76100000-0000-4000-8000-000000000001'
);

select is(
  (select signed_in_at from public.phaseone_attendance_effective where roster_id = '76100000-0000-4000-8000-000000000011'),
  null::timestamptz,
  'PM remains not arrived when the volunteer checks out before PM starts'
);

select is(
  (select signed_out_at from public.phaseone_attendance_effective where roster_id = '76100000-0000-4000-8000-000000000011'),
  null::timestamptz,
  'PM does not inherit the earlier checkout when the volunteer never reached PM'
);

select * from finish();
rollback;
