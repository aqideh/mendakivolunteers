begin;

select plan(53);

select has_schema('gamification', 'gamification schema exists');
select has_table('gamification', 'point_rules', 'point rules table exists');
select has_table('gamification', 'point_ledger_entries', 'point ledger table exists');
select has_view(
  'gamification',
  'volunteer_point_balances',
  'volunteer point balance view exists'
);
select has_function(
  'gamification',
  'reconcile_verified_attendance_points',
  array['uuid'],
  'attendance reconciliation function exists'
);
select has_function(
  'core',
  'link_current_account_by_verified_email',
  array[]::text[],
  'verified-email account linker exists'
);
select has_function(
  'ymhub',
  'reconcile_gamification_points',
  array['uuid'],
  'service-facing point reconciliation wrapper exists'
);

select has_column(
  'core',
  'volunteers',
  'primary_email_normalized',
  'volunteer projection stores the approved matching email'
);
select has_column(
  'core',
  'volunteers',
  'account_access_eligible',
  'volunteer projection stores account eligibility'
);

select has_column(
  'gamification',
  'point_ledger_entries',
  'source_occurred_at',
  'point entries retain the activity occurrence time'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'gamification.point_rules'::regclass
  ),
  'point rules have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'gamification.point_ledger_entries'::regclass
  ),
  'point ledger has forced row-level security'
);

select ok(
  not has_table_privilege('anon', 'gamification.point_rules', 'SELECT'),
  'anonymous users cannot read point rules'
);
select ok(
  not has_table_privilege('anon', 'gamification.point_ledger_entries', 'SELECT'),
  'anonymous users cannot read the point ledger'
);
select ok(
  not has_table_privilege('authenticated', 'gamification.point_rules', 'SELECT'),
  'point rules are not directly exposed through the Data API'
);
select ok(
  not has_table_privilege('authenticated', 'gamification.point_ledger_entries', 'SELECT'),
  'the point ledger is not directly exposed through the Data API'
);
select ok(
  not has_table_privilege('authenticated', 'gamification.point_ledger_entries', 'INSERT'),
  'authenticated users cannot insert point entries'
);
select ok(
  not has_table_privilege('authenticated', 'gamification.point_ledger_entries', 'UPDATE'),
  'authenticated users cannot update point entries'
);
select ok(
  has_function_privilege(
    'authenticated',
    'core.link_current_account_by_verified_email()',
    'EXECUTE'
  ),
  'authenticated accounts can request controlled profile linking'
);
select ok(
  has_function_privilege(
    'authenticated',
    'core.get_current_points_snapshot()',
    'EXECUTE'
  ),
  'authenticated accounts can request their protected point snapshot'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'gamification.reconcile_verified_attendance_points(uuid)',
    'EXECUTE'
  ),
  'volunteers cannot run point reconciliation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'ymhub.reconcile_gamification_points(uuid)',
    'EXECUTE'
  ),
  'volunteers cannot call the exposed reconciliation wrapper'
);
select ok(
  has_function_privilege(
    'service_role',
    'ymhub.reconcile_gamification_points(uuid)',
    'EXECUTE'
  ),
  'the server-side integration identity can reconcile points'
);
select ok(
  has_table_privilege(
    'service_role',
    'gamification.point_ledger_entries',
    'SELECT'
  ),
  'service role can read the point ledger for reconciliation'
);
select ok(
  has_table_privilege(
    'service_role',
    'gamification.point_ledger_entries',
    'INSERT'
  ),
  'service role can append point entries'
);
select ok(
  not has_table_privilege(
    'service_role',
    'gamification.point_ledger_entries',
    'UPDATE'
  ),
  'service role cannot update point entries'
);
select ok(
  not has_table_privilege(
    'service_role',
    'gamification.point_ledger_entries',
    'DELETE'
  ),
  'service role cannot delete point entries'
);
select ok(
  not has_table_privilege(
    'service_role',
    'gamification.point_ledger_entries',
    'TRUNCATE'
  ),
  'service role cannot truncate the point ledger'
);

select has_table('public', 'phaseone_roster', 'staff roster remains present');
select has_table(
  'public',
  'phaseone_attendance',
  'staff attendance remains present'
);
select ok(
  not has_table_privilege('authenticated', 'public.phaseone_roster', 'SELECT'),
  'staff roster remains unavailable through ordinary authenticated Data API access'
);
select ok(
  pg_get_functiondef(
    'gamification.reconcile_verified_attendance_points(uuid)'::regprocedure
  ) not like '%phaseone_%',
  'point reconciliation does not read operational roster or attendance tables'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '71000000-0000-4000-8000-000000000001',
  'points-volunteer@example.test',
  now()
);

insert into core.volunteers (
  id,
  ymhub_volunteer_id,
  display_name,
  primary_email_normalized,
  account_access_eligible,
  ymhub_status,
  source_updated_at,
  last_synced_at
) values (
  '71000000-0000-4000-8000-000000000011',
  'YMHUB-POINTS-001',
  'Points Volunteer',
  'points-volunteer@example.test',
  true,
  'Active',
  now(),
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.link_current_account_by_verified_email(),
  'linked',
  'a verified account links to exactly one approved YM Hub volunteer'
);

reset role;

select is(
  (
    select auth_user_id
    from core.volunteers
    where id = '71000000-0000-4000-8000-000000000011'
  ),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'the canonical volunteer projection stores the KELUARGA account link'
);
select is(
  (
    select status::text
    from core.user_accounts
    where id = '71000000-0000-4000-8000-000000000001'
  ),
  'active',
  'a uniquely matched volunteer account becomes active'
);

insert into auth.users (id, email, email_confirmed_at)
values (
  '71000000-0000-4000-8000-000000000002',
  'shared-points@example.test',
  now()
);

insert into core.volunteers (
  id,
  ymhub_volunteer_id,
  display_name,
  primary_email_normalized,
  account_access_eligible
) values
  (
    '71000000-0000-4000-8000-000000000012',
    'YMHUB-POINTS-002',
    'Shared Email One',
    'shared-points@example.test',
    true
  ),
  (
    '71000000-0000-4000-8000-000000000013',
    'YMHUB-POINTS-003',
    'Shared Email Two',
    'shared-points@example.test',
    true
  );

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.link_current_account_by_verified_email(),
  'needs_review',
  'an ambiguous verified email is not linked automatically'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.volunteers
    where auth_user_id = '71000000-0000-4000-8000-000000000002'
  ),
  0,
  'an ambiguous account is not attached to either volunteer record'
);
select is(
  (
    select count(*)::integer
    from core.account_link_cases
    where auth_user_id = '71000000-0000-4000-8000-000000000002'
      and status = 'needs_review'
      and reason_code = 'ambiguous_verified_email'
  ),
  1,
  'an ambiguous verified email creates one review case'
);

select set_config(
  'request.jwt.claim.sub',
  '71000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);

insert into gamification.point_rules (
  stable_key,
  version,
  name,
  description,
  source_kind,
  calculation_method,
  points_value,
  effective_from,
  status,
  activated_at
) values (
  'verified-attendance',
  1,
  'Verified attendance',
  'Test-only rule awarding points from verified YM Hub hours.',
  'ymhub_verified_attendance',
  'per_verified_hour',
  10,
  '2026-01-01T00:00:00Z',
  'active',
  now()
);

insert into ymhub.attendance_snapshots (
  volunteer_id,
  ymhub_attendance_id,
  ymhub_activity_id,
  activity_title,
  activity_starts_at,
  activity_ends_at,
  state,
  source_status,
  verified_hours,
  verified_at,
  source_updated_at,
  last_synced_at
) values (
  '71000000-0000-4000-8000-000000000011',
  'YMHUB-ATT-POINTS-001',
  'YMHUB-ACT-POINTS-001',
  'Verified community activity',
  '2026-08-01T01:00:00Z',
  '2026-08-01T03:30:00Z',
  'verified',
  'Verified',
  2.50,
  '2026-08-05T01:00:00Z',
  '2026-08-05T01:00:00Z',
  now()
);

select throws_ok(
  $$
    update gamification.point_rules
    set points_value = 999
    where stable_key = 'verified-attendance'
      and version = 1
  $$,
  'P0001',
  'Activated point rules are immutable',
  'an activated point rule cannot be rewritten'
);

select is(
  gamification.reconcile_verified_attendance_points(
    '71000000-0000-4000-8000-000000000011'
  ),
  1,
  'first reconciliation appends one point award'
);
select is(
  (
    select sum(points_delta)::numeric(12, 2)
    from gamification.point_ledger_entries
    where volunteer_id = '71000000-0000-4000-8000-000000000011'
  ),
  25.00::numeric(12, 2),
  'verified YM Hub hours produce the expected points'
);
select is(
  (
    select source_occurred_at
    from gamification.point_ledger_entries
    where volunteer_id = '71000000-0000-4000-8000-000000000011'
    order by id
    limit 1
  ),
  '2026-08-01T01:00:00Z'::timestamptz,
  'the award records the activity date rather than the later verification date'
);
select is(
  gamification.reconcile_verified_attendance_points(
    '71000000-0000-4000-8000-000000000011'
  ),
  0,
  'reconciliation is idempotent when the source has not changed'
);

update ymhub.attendance_snapshots
set
  verified_hours = 3.00,
  source_updated_at = '2026-08-06T01:00:00Z'
where ymhub_attendance_id = 'YMHUB-ATT-POINTS-001';

select is(
  gamification.reconcile_verified_attendance_points(
    '71000000-0000-4000-8000-000000000011'
  ),
  1,
  'an authoritative hours correction appends one adjustment'
);
select is(
  (
    select sum(points_delta)::numeric(12, 2)
    from gamification.point_ledger_entries
    where volunteer_id = '71000000-0000-4000-8000-000000000011'
  ),
  30.00::numeric(12, 2),
  'the ledger balance reflects the corrected verified hours'
);

update ymhub.attendance_snapshots
set
  state = 'rejected',
  verified_hours = null,
  verified_at = null,
  source_status = 'Rejected',
  source_updated_at = '2026-08-07T01:00:00Z'
where ymhub_attendance_id = 'YMHUB-ATT-POINTS-001';

select is(
  gamification.reconcile_verified_attendance_points(
    '71000000-0000-4000-8000-000000000011'
  ),
  1,
  'a disqualified authoritative record appends one reversal'
);
select is(
  (
    select points_balance
    from gamification.volunteer_point_balances
    where volunteer_id = '71000000-0000-4000-8000-000000000011'
  ),
  0.00::numeric(12, 2),
  'the balance view resolves awards, adjustments and reversals'
);

select throws_ok(
  $$
    update gamification.point_ledger_entries
    set reason = 'Attempted mutation'
    where volunteer_id = '71000000-0000-4000-8000-000000000011'
  $$,
  'P0001',
  'Point ledger entries are append-only',
  'existing point entries cannot be edited'
);

set local role authenticated;
select is(
  (core.get_current_points_snapshot() ->> 'balance')::numeric(12, 2),
  0.00::numeric(12, 2),
  'the protected point snapshot returns the volunteer balance'
);
select is(
  jsonb_array_length(core.get_current_points_snapshot() -> 'entries'),
  3,
  'the protected point snapshot returns only the volunteer point history'
);
select is(
  core.get_current_points_snapshot() -> 'entries' -> 0 ->> 'source_occurred_at',
  '2026-08-01T01:00:00+00:00',
  'the protected point snapshot includes the source activity time'
);

reset role;

insert into gamification.point_rules (
  stable_key,
  version,
  name,
  description,
  source_kind,
  calculation_method,
  points_value,
  effective_from,
  status
) values (
  'verified-attendance-draft',
  1,
  'Draft attendance rule',
  'A draft rule that must not be visible or award points.',
  'ymhub_verified_attendance',
  'flat',
  5,
  '2027-01-01T00:00:00Z',
  'draft'
);

select throws_ok(
  $$
    insert into gamification.point_ledger_entries (
      volunteer_id,
      rule_id,
      source_kind,
      source_record_id,
      source_occurred_at,
      source_updated_at,
      source_title,
      entry_kind,
      points_delta,
      reason,
      source_snapshot
    )
    select
      '71000000-0000-4000-8000-000000000011',
      id,
      source_kind,
      'DRAFT-RULE-SOURCE',
      now(),
      now(),
      'Draft rule source',
      'award',
      5,
      'This insert must be rejected.',
      '{}'::jsonb
    from gamification.point_rules
    where stable_key = 'verified-attendance-draft'
  $$,
  '23514',
  'Draft point rules cannot create ledger entries',
  'a draft point rule cannot award points'
);

set local role authenticated;
select is(
  core.get_current_points_snapshot() -> 'active_rule' ->> 'name',
  'Verified attendance',
  'the protected point snapshot exposes the active rule but not a draft rule'
);

reset role;

select * from finish();
rollback;
