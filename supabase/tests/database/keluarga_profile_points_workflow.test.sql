begin;

select plan(21);

select has_function(
  'core',
  'update_current_volunteer_profile',
  array['text', 'text'],
  'volunteer profile update function exists'
);

select has_function(
  'core',
  'award_manual_points',
  array['uuid', 'numeric', 'text', 'uuid'],
  'manual point award function exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.update_current_volunteer_profile(text,text)',
    'EXECUTE'
  ),
  'authenticated volunteers can call the controlled profile update function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.award_manual_points(uuid,numeric,text,uuid)',
    'EXECUTE'
  ),
  'authenticated staff can call the role-checked manual point function'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '92000000-0000-4000-8000-000000000001',
  'profile-volunteer@example.test',
  now(),
  '{"full_name":"Original Volunteer"}'::jsonb
);

insert into core.volunteers (
  id,
  auth_user_id,
  display_name,
  primary_email_normalized,
  mobile
)
values (
  '92000000-0000-4000-8000-000000000011',
  '92000000-0000-4000-8000-000000000001',
  'Original Volunteer',
  'profile-volunteer@example.test',
  '81234567'
);

update core.user_accounts
set status = 'active'
where id = '92000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.update_current_volunteer_profile(
    'Updated Volunteer',
    '+65 9000 0000'
  ) ->> 'display_name',
  'Updated Volunteer',
  'volunteer can update own display name'
);

reset role;

select is(
  (
    select display_name
    from core.volunteers
    where id = '92000000-0000-4000-8000-000000000011'
  ),
  'Updated Volunteer',
  'volunteer projection stores updated display name'
);

select is(
  (
    select mobile
    from core.volunteers
    where id = '92000000-0000-4000-8000-000000000011'
  ),
  '+65 9000 0000',
  'volunteer projection stores updated mobile'
);

select is(
  (
    select display_name
    from core.user_accounts
    where id = '92000000-0000-4000-8000-000000000001'
  ),
  'Updated Volunteer',
  'account display name stays aligned with volunteer profile'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'volunteer.profile_updated'
      and target_id = '92000000-0000-4000-8000-000000000011'
  ),
  1,
  'profile update writes one audit event'
);

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select core.update_current_volunteer_profile(
      'Updated Volunteer',
      'not-a-phone'
    )
  $$,
  '22023',
  'Enter a valid mobile number',
  'invalid mobile values are rejected'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '92000000-0000-4000-8000-000000000002',
  'points-manager@example.test',
  now()
);

update core.user_accounts
set status = 'active'
where id = '92000000-0000-4000-8000-000000000002';

insert into core.user_roles (user_id, role, reason)
values (
  '92000000-0000-4000-8000-000000000002',
  'gamification_manager',
  'Slice 5 regression test'
)
on conflict (user_id, role) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  core.award_manual_points(
    '92000000-0000-4000-8000-000000000011',
    25,
    'Outstanding support during a community programme.',
    '92000000-0000-4000-8000-000000000099'
  ) > 0,
  'gamification manager can award manual recognition points'
);

select is(
  core.award_manual_points(
    '92000000-0000-4000-8000-000000000011',
    25,
    'Outstanding support during a community programme.',
    '92000000-0000-4000-8000-000000000099'
  ),
  (
    select id
    from gamification.point_ledger_entries
    where source_kind = 'manual_recognition'
      and source_record_id = '92000000-0000-4000-8000-000000000099'
  ),
  'repeating the same request ID is idempotent'
);

select throws_ok(
  $
    select core.award_manual_points(
      '92000000-0000-4000-8000-000000000011',
      26,
      'Outstanding support during a community programme.',
      '92000000-0000-4000-8000-000000000099'
    )
  $,
  '23505',
  'Request ID has already been used for a different point award',
  'reusing a request ID for a different award is rejected'
);

reset role;

select is(
  (
    select count(*)::integer
    from gamification.point_ledger_entries
    where volunteer_id = '92000000-0000-4000-8000-000000000011'
      and source_kind = 'manual_recognition'
  ),
  1,
  'manual recognition creates only one ledger entry'
);

select is(
  (
    select points_delta
    from gamification.point_ledger_entries
    where volunteer_id = '92000000-0000-4000-8000-000000000011'
      and source_kind = 'manual_recognition'
  ),
  25.00::numeric(12, 2),
  'manual recognition stores the awarded point amount'
);

select is(
  (
    select reason
    from gamification.point_ledger_entries
    where volunteer_id = '92000000-0000-4000-8000-000000000011'
      and source_kind = 'manual_recognition'
  ),
  'Outstanding support during a community programme.',
  'manual recognition stores the award reason'
);

select is(
  (
    select points_balance
    from gamification.volunteer_point_balances
    where volunteer_id = '92000000-0000-4000-8000-000000000011'
  ),
  25.00::numeric(12, 2),
  'manual recognition contributes to the volunteer balance'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'gamification.manual_points_awarded'
      and target_id = '92000000-0000-4000-8000-000000000011'
  ),
  1,
  'manual point award writes one audit event'
);

select set_config(
  'request.jwt.claim.sub',
  '92000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"92000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select core.award_manual_points(
      '92000000-0000-4000-8000-000000000011',
      10,
      'Volunteer cannot award own points.',
      '92000000-0000-4000-8000-000000000098'
    )
  $$,
  '42501',
  'Gamification management permission is required',
  'ordinary volunteers cannot award points'
);

select is(
  core.get_current_points_snapshot()
    -> 'entries'
    -> 0
    ->> 'source_kind',
  'manual_recognition',
  'volunteer point snapshot exposes the manual recognition provenance'
);

reset role;

select is(
  (
    select count(*)::integer
    from ymhub.attendance_snapshots
    where volunteer_id = '92000000-0000-4000-8000-000000000011'
  ),
  0,
  'manual recognition does not create or alter YM Hub attendance'
);

select * from finish();
rollback;
