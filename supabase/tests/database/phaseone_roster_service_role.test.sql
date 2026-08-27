begin;

select plan(4);

select ok(
  has_column_privilege('service_role', 'auth.users', 'id', 'SELECT'),
  'service role can verify staff auth user IDs used by roster RPCs'
);
select ok(
  not has_column_privilege('anon', 'auth.users', 'id', 'SELECT'),
  'anonymous clients cannot read auth user IDs'
);
select ok(
  not has_column_privilege('authenticated', 'auth.users', 'id', 'SELECT'),
  'authenticated clients cannot read auth user IDs'
);

insert into auth.users (id, email)
values ('73000000-0000-4000-8000-000000000001', 'roster-service-role@example.test');

insert into public.phaseone_events (id, title, slug, created_by, updated_by)
values (
  '73000000-0000-4000-8000-000000000002',
  'Roster service role test',
  'roster-service-role-test',
  '73000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id, event_id, label, starts_at)
values (
  '73000000-0000-4000-8000-000000000003',
  '73000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-08-29 01:00:00+00'
);

set local role service_role;
select lives_ok(
  $$
    select public.phaseone_apply_roster_import(
      '73000000-0000-4000-8000-000000000002',
      'merge',
      'service-role-test.csv',
      '[{"timeslot_id":"73000000-0000-4000-8000-000000000003","volunteer_key":"MV-TEST","volunteer_name":"Test Volunteer","email":"test-volunteer@example.test","mobile":"91234567","tshirt_size":"M"}]'::jsonb,
      '73000000-0000-4000-8000-000000000001'
    )
  $$,
  'service role can execute roster import without auth.users permission errors'
);
reset role;

select * from finish();
rollback;
