begin;

select plan(22);

select has_table('public', 'keluarga_registrations', 'KELUARGA registration table exists');
select has_table('public', 'keluarga_registration_shifts', 'registration shift selections exist');
select has_table('public', 'keluarga_registration_status_history', 'registration history exists');
select has_table('public', 'keluarga_notifications', 'registration notifications exist');
select has_column('public', 'phaseone_event_timeslots', 'registration_capacity', 'shifts support registration capacity');
select has_column('public', 'phaseone_roster', 'registration_id', 'event roster retains registration provenance');

select ok(
  has_function_privilege('authenticated', 'core.ensure_current_keluarga_volunteer()', 'EXECUTE'),
  'authenticated users can provision their KELUARGA identity'
);
select ok(
  has_function_privilege('authenticated', 'core.submit_keluarga_registration(uuid,uuid[],text,text)', 'EXECUTE'),
  'authenticated volunteers can submit registrations through the controlled RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.keluarga_registrations', 'INSERT'),
  'browser clients cannot bypass the registration RPC'
);
select ok(
  not has_function_privilege('authenticated', 'core.review_keluarga_registration(uuid,text,text,uuid)', 'EXECUTE'),
  'volunteers cannot review registrations'
);

insert into auth.users(id, email, email_confirmed_at)
values
  ('81000000-0000-4000-8000-000000000001', 'slice3-staff@example.test', now()),
  ('81000000-0000-4000-8000-000000000002', 'slice3-volunteer@example.test', now()),
  ('81000000-0000-4000-8000-000000000003', 'slice3-second@example.test', now());

update core.user_accounts
set status = 'active'
where id = '81000000-0000-4000-8000-000000000001';

insert into core.user_roles(user_id, role, granted_by, reason)
values (
  '81000000-0000-4000-8000-000000000001',
  'attendance_manager',
  '81000000-0000-4000-8000-000000000001',
  'Slice 3 test'
);

insert into public.phaseone_events(
  id,
  title,
  slug,
  venue,
  navigation_destination,
  opportunity_summary,
  is_opportunity_published,
  created_by,
  updated_by
)
values (
  '81000000-0000-4000-8000-000000000010',
  'Slice 3 registration test',
  'slice-3-registration-test',
  'Test venue',
  'Test venue Singapore',
  'Test KELUARGA registration flow.',
  true,
  '81000000-0000-4000-8000-000000000001',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  registration_capacity
)
values (
  '81000000-0000-4000-8000-000000000011',
  '81000000-0000-4000-8000-000000000010',
  'Morning',
  now() + interval '10 days',
  now() + interval '10 days 3 hours',
  1
);

select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'verified account provisions a native KELUARGA volunteer'
);

select matches(
  (
    select volunteer_code
    from core.volunteers
    where auth_user_id = '81000000-0000-4000-8000-000000000002'
  ),
  '^KEL[0-9]{5}$',
  'provisioned volunteer receives a KEL code'
);

select lives_ok(
  $$
    select core.submit_keluarga_registration(
      '81000000-0000-4000-8000-000000000010',
      array['81000000-0000-4000-8000-000000000011']::uuid[],
      'Slice Three Volunteer',
      '91234567'
    )
  $$,
  'volunteer can submit a programme registration'
);

select is(
  (select status::text from public.keluarga_registrations),
  'pending',
  'new registration starts pending staff review'
);

select is(
  (select count(*)::integer from public.keluarga_notifications),
  1,
  'submission generates an in-app notification'
);

reset role;
set local role service_role;

select is(
  core.review_keluarga_registration(
    (select id from public.keluarga_registrations where event_id = '81000000-0000-4000-8000-000000000010'),
    'confirmed',
    'Approved for test',
    '81000000-0000-4000-8000-000000000001'
  ),
  'confirmed',
  'event manager can confirm registration'
);

select is(
  (
    select entry_method
    from public.phaseone_roster
    where event_id = '81000000-0000-4000-8000-000000000010'
  ),
  'keluarga_registration',
  'confirmation creates a KELUARGA-sourced roster row'
);

select ok(
  exists (
    select 1
    from public.phaseone_roster roster
    join public.keluarga_registrations registration
      on registration.id = roster.registration_id
    where registration.status = 'confirmed'
      and roster.volunteer_id = registration.volunteer_id
  ),
  'roster assignment retains registration and volunteer provenance'
);

select is(
  (select count(*)::integer from public.keluarga_notifications),
  2,
  'confirmation generates a second notification'
);

reset role;
select set_config('request.jwt.claim.sub', '81000000-0000-4000-8000-000000000003', true);
select set_config('request.jwt.claims', '{"sub":"81000000-0000-4000-8000-000000000003","role":"authenticated"}', true);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'second verified account also provisions natively'
);

select lives_ok(
  $$
    select core.submit_keluarga_registration(
      '81000000-0000-4000-8000-000000000010',
      array['81000000-0000-4000-8000-000000000011']::uuid[],
      'Second Slice Three Volunteer',
      null
    )
  $$,
  'second volunteer can submit while capacity is reviewed at confirmation'
);

reset role;
set local role service_role;

select throws_ok(
  $$
    select core.review_keluarga_registration(
      (
        select registration.id
        from public.keluarga_registrations registration
        join core.volunteers volunteer on volunteer.id = registration.volunteer_id
        where volunteer.auth_user_id = '81000000-0000-4000-8000-000000000003'
      ),
      'confirmed',
      null,
      '81000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'A selected shift is full; waitlist this registration instead',
  'capacity is enforced transactionally when staff confirms'
);

select * from finish();
rollback;
