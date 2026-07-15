begin;

select plan(27);

select has_schema('ymhub', 'YM Hub read-model schema exists');
select has_table('ymhub', 'volunteer_sync_status', 'volunteer sync status table exists');
select has_table('ymhub', 'registration_snapshots', 'registration snapshots table exists');
select has_table('ymhub', 'attendance_snapshots', 'attendance snapshots table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'ymhub.volunteer_sync_status'::regclass
  ),
  'volunteer sync status has forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'ymhub.registration_snapshots'::regclass
  ),
  'registration snapshots have forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'ymhub.attendance_snapshots'::regclass
  ),
  'attendance snapshots have forced row-level security'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'ymhub'
      and tablename = 'volunteer_sync_status'
  ),
  2,
  'volunteer sync status has self and support read policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'ymhub'
      and tablename = 'registration_snapshots'
  ),
  2,
  'registration snapshots have self and support read policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'ymhub'
      and tablename = 'attendance_snapshots'
  ),
  2,
  'attendance snapshots have self and support read policies'
);

select ok(
  not has_table_privilege('anon', 'ymhub.volunteer_sync_status', 'SELECT'),
  'anonymous users cannot read volunteer sync status'
);

select ok(
  not has_table_privilege('anon', 'ymhub.registration_snapshots', 'SELECT'),
  'anonymous users cannot read registration snapshots'
);

select ok(
  not has_table_privilege('anon', 'ymhub.attendance_snapshots', 'SELECT'),
  'anonymous users cannot read attendance snapshots'
);

select ok(
  has_table_privilege('authenticated', 'ymhub.volunteer_sync_status', 'SELECT'),
  'authenticated users can read their sync status through RLS'
);

select ok(
  has_table_privilege('authenticated', 'ymhub.registration_snapshots', 'SELECT'),
  'authenticated users can read their registration snapshots through RLS'
);

select ok(
  has_table_privilege('authenticated', 'ymhub.attendance_snapshots', 'SELECT'),
  'authenticated users can read their attendance snapshots through RLS'
);

select ok(
  not has_table_privilege('authenticated', 'ymhub.registration_snapshots', 'INSERT'),
  'authenticated users cannot insert registration snapshots'
);

select ok(
  not has_table_privilege('authenticated', 'ymhub.attendance_snapshots', 'UPDATE'),
  'authenticated users cannot update attendance snapshots'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.current_volunteer_id()',
    'EXECUTE'
  ),
  'authenticated users can resolve their internal volunteer ID'
);

select throws_ok(
  $$
    insert into ymhub.attendance_snapshots (
      volunteer_id,
      ymhub_attendance_id,
      ymhub_activity_id,
      activity_title,
      activity_starts_at,
      state,
      source_status,
      source_updated_at,
      last_synced_at
    ) values (
      '10000000-0000-4000-8000-000000000001',
      'PROTO-ATT-INVALID',
      'PROTO-ACT-INVALID',
      'Invalid verified record',
      now(),
      'verified',
      'PROTO_VERIFIED',
      now(),
      now()
    )
  $$,
  '23514',
  'new row for relation "attendance_snapshots" violates check constraint "attendance_snapshots_verification_consistent"',
  'verified attendance requires hours and a verification timestamp'
);

select is(
  (
    select sum(verified_hours)::numeric(8, 2)
    from ymhub.attendance_snapshots
    where state = 'verified'
  ),
  10.50::numeric(8, 2),
  'local fixtures contain 10.50 authoritative-style verified hours'
);

insert into auth.users (id, email)
values (
  '60000000-0000-4000-8000-000000000001',
  'phase3-volunteer@example.test'
);

update core.user_accounts
set status = 'active'
where id = '60000000-0000-4000-8000-000000000001';

update core.volunteers
set auth_user_id = '60000000-0000-4000-8000-000000000001'
where id = '10000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (select count(*)::integer from ymhub.registration_snapshots),
  2,
  'linked volunteer sees only their registration snapshots'
);

select is(
  (select count(*)::integer from ymhub.attendance_snapshots),
  3,
  'linked volunteer sees only their attendance snapshots'
);

select is(
  (select count(*)::integer from ymhub.volunteer_sync_status),
  1,
  'linked volunteer sees only their sync status'
);

reset role;
update core.user_accounts
set status = 'suspended'
where id = '60000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (select count(*)::integer from ymhub.registration_snapshots),
  0,
  'suspended volunteer cannot read registration snapshots'
);

select is(
  (select count(*)::integer from ymhub.attendance_snapshots),
  0,
  'suspended volunteer cannot read attendance snapshots'
);

select is(
  (select count(*)::integer from ymhub.volunteer_sync_status),
  0,
  'suspended volunteer cannot read sync status'
);

select * from finish();
rollback;
