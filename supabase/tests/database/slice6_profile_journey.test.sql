begin;

select plan(37);

select has_table('gamification', 'badge_definitions', 'badge definitions table exists');
select has_table('gamification', 'volunteer_badges', 'volunteer badge awards table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'gamification.badge_definitions'::regclass
  ),
  'badge definitions have forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'gamification.volunteer_badges'::regclass
  ),
  'volunteer badge awards have forced row-level security'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'gamification.badge_definitions',
    'SELECT'
  ),
  'authenticated browser users cannot directly read the private badge catalogue'
);

select ok(
  not has_schema_privilege('authenticated', 'gamification', 'USAGE'),
  'authenticated browser users still have no usage on the private gamification schema'
);

select ok(
  has_schema_privilege('service_role', 'gamification', 'USAGE'),
  'service role retains gamification schema usage for server administration'
);

select ok(
  exists (
    select 1
    from pg_roles as roles
    cross join lateral unnest(roles.rolconfig) as setting
    where roles.rolname = 'authenticator'
      and setting like 'pgrst.db_schemas=%gamification%'
  ),
  'PostgREST authenticator exposes gamification for server/service-role administration'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.create_badge_definition(text,text,text)',
    'EXECUTE'
  ),
  'authenticated staff can invoke the role-gated badge definition function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.award_badge(uuid,uuid,text,uuid)',
    'EXECUTE'
  ),
  'authenticated staff can invoke the role-gated badge award function'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.get_current_badges_snapshot()',
    'EXECUTE'
  ),
  'authenticated volunteers can invoke their scoped badge snapshot'
);

insert into auth.users (id, email, email_confirmed_at, raw_user_meta_data)
values (
  '93000000-0000-4000-8000-000000000001',
  'slice6-volunteer@example.test',
  now(),
  '{"full_name":"Slice Six Volunteer"}'::jsonb
);

insert into core.volunteers (
  id,
  auth_user_id,
  display_name,
  primary_email_normalized,
  mobile
)
values (
  '93000000-0000-4000-8000-000000000011',
  '93000000-0000-4000-8000-000000000001',
  'Slice Six Volunteer',
  'slice6-volunteer@example.test',
  '81230001'
);

update core.user_accounts
set status = 'active'
where id = '93000000-0000-4000-8000-000000000001';

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select core.create_badge_definition(
      'self-awarded',
      'Self Awarded',
      'Ordinary volunteers must not define their own badges.'
    )
  $$,
  '42501',
  'Gamification management permission is required',
  'ordinary volunteers cannot define badges'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '93000000-0000-4000-8000-000000000002',
  'slice6-gamification@example.test',
  now()
);

update core.user_accounts
set status = 'active'
where id = '93000000-0000-4000-8000-000000000002';

insert into core.user_roles (user_id, role, reason)
values (
  '93000000-0000-4000-8000-000000000002',
  'gamification_manager',
  'Slice 6 badge regression test'
)
on conflict (user_id, role) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table slice6_test_ids (
  kind text primary key,
  id uuid not null
);
grant select, insert, update, delete on slice6_test_ids to authenticated;

insert into slice6_test_ids (kind, id)
values (
  'badge_definition',
  core.create_badge_definition(
    'community-builder',
    'Community Builder',
    'Recognises reviewed contributions that strengthen the volunteer community.'
  )
);

select ok(
  (select id from slice6_test_ids where kind = 'badge_definition') is not null,
  'gamification manager can create a badge definition'
);

insert into slice6_test_ids (kind, id)
values (
  'badge_award',
  core.award_badge(
    '93000000-0000-4000-8000-000000000011',
    (select id from slice6_test_ids where kind = 'badge_definition'),
    'Consistently supported fellow volunteers during programme delivery.',
    '93000000-0000-4000-8000-000000000099'
  )
);

select ok(
  (select id from slice6_test_ids where kind = 'badge_award') is not null,
  'gamification manager can award a badge'
);

select is(
  core.award_badge(
    '93000000-0000-4000-8000-000000000011',
    (select id from slice6_test_ids where kind = 'badge_definition'),
    'Consistently supported fellow volunteers during programme delivery.',
    '93000000-0000-4000-8000-000000000099'
  ),
  (select id from slice6_test_ids where kind = 'badge_award'),
  'repeating the same badge request is idempotent'
);

reset role;

select is(
  (
    select count(*)::integer
    from gamification.volunteer_badges
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
      and revoked_at is null
  ),
  1,
  'badge award creates one active record'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'gamification.badge_awarded'
      and target_id = '93000000-0000-4000-8000-000000000011'
  ),
  1,
  'badge award creates one audit event'
);

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.get_current_badges_snapshot()
    -> 'badges'
    -> 0
    ->> 'name',
  'Community Builder',
  'volunteer badge snapshot exposes the active badge'
);

select ok(
  not (
    core.get_current_badges_snapshot()
      -> 'badges'
      -> 0
      ? 'reason'
  ),
  'volunteer badge snapshot does not expose the internal award reason'
);

select throws_ok(
  $$
    select core.award_badge(
      '93000000-0000-4000-8000-000000000011',
      '00000000-0000-4000-8000-000000000001',
      'Volunteer cannot award their own badge.',
      '93000000-0000-4000-8000-000000000098'
    )
  $$,
  '42501',
  'Gamification management permission is required',
  'ordinary volunteers cannot award badges'
);

reset role;

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select core.revoke_badge(
      (select id from slice6_test_ids where kind = 'badge_award'),
      'Correction after staff review.'
    )
  $$,
  'gamification manager can revoke an active badge'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  jsonb_array_length(core.get_current_badges_snapshot() -> 'badges'),
  0,
  'revoked badges disappear from the volunteer active snapshot'
);

reset role;

select has_table(
  'pathways',
  'volunteer_positions',
  'volunteer pathway position history table exists'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.volunteer_positions'::regclass
  ),
  'volunteer pathway positions have forced row-level security'
);

select ok(
  has_table_privilege(
    'authenticated',
    'pathways.volunteer_positions',
    'SELECT'
  ),
  'authenticated pathway-position SELECT remains available during expand deployment'
);

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select pathways.assign_volunteer_position(
      '93000000-0000-4000-8000-000000000011',
      (
        select stage.id
        from pathways.stages as stage
        join pathways.map_versions as version on version.id = stage.version_id
        join pathways.maps as pathway_map on pathway_map.active_version_id = version.id
        where stage.stable_key = 'mentor.contribute'
        limit 1
      ),
      'Volunteer cannot self-assign a pathway position.',
      null
    )
  $$,
  '42501',
  'Pathway manager access required',
  'ordinary volunteers cannot assign pathway positions'
);

reset role;

insert into auth.users (id, email, email_confirmed_at)
values (
  '93000000-0000-4000-8000-000000000003',
  'slice6-pathways@example.test',
  now()
);

update core.user_accounts
set status = 'active'
where id = '93000000-0000-4000-8000-000000000003';

insert into core.user_roles (user_id, role, reason)
values (
  '93000000-0000-4000-8000-000000000003',
  'pathway_manager',
  'Slice 6 pathway regression test'
)
on conflict (user_id, role) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  pathways.assign_volunteer_position(
    '93000000-0000-4000-8000-000000000011',
    (
      select stage.id
      from pathways.stages as stage
      join pathways.map_versions as version on version.id = stage.version_id
      join pathways.maps as pathway_map on pathway_map.active_version_id = version.id
      where stage.stable_key = 'mentor.contribute'
      limit 1
    ),
    'Reviewed mentoring experience supports the Contribute stage.',
    'Confirmed after staff review.'
  ) is not null,
  'pathway manager can assign a reviewed position'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
      and ended_at is null
  ),
  1,
  'expand release keeps the volunteer own-position read compatible with the deployed app'
);

select is(
  jsonb_array_length(
    core.get_current_pathway_positions_snapshot() -> 'positions'
  ),
  1,
  'volunteer scoped pathway snapshot exposes their active position'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select ok(
  pathways.assign_volunteer_position(
    '93000000-0000-4000-8000-000000000011',
    (
      select stage.id
      from pathways.stages as stage
      join pathways.map_versions as version on version.id = stage.version_id
      join pathways.maps as pathway_map on pathway_map.active_version_id = version.id
      where stage.stable_key = 'mentor.specialise'
      limit 1
    ),
    'Reviewed mentoring experience now supports the Specialise stage.',
    null
  ) is not null,
  'a later position on the same track can replace the active position'
);

reset role;

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
      and track_stable_key = 'mentor'
  ),
  2,
  'pathway history retains both assignments'
);

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
      and track_stable_key = 'mentor'
      and ended_at is null
  ),
  1,
  'only one active position remains per pathway track'
);

select set_config(
  'request.jwt.claim.sub',
  '93000000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"93000000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select lives_ok(
  $$
    select pathways.clear_volunteer_position(
      (
        select id
        from pathways.volunteer_positions
        where volunteer_id = '93000000-0000-4000-8000-000000000011'
          and track_stable_key = 'mentor'
          and ended_at is null
      ),
      'Volunteer pathway position reset after review.'
    )
  $$,
  'pathway manager can clear an active position'
);

reset role;

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
      and ended_at is null
  ),
  0,
  'clearing a pathway position leaves no active record on that track'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'pathway.position_assigned'
      and target_id = '93000000-0000-4000-8000-000000000011'
  ),
  2,
  'each pathway assignment is audited'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'pathway.position_cleared'
      and target_id = '93000000-0000-4000-8000-000000000011'
  ),
  1,
  'pathway clearing is audited'
);

select is(
  (
    select count(*)::integer
    from ymhub.attendance_snapshots
    where volunteer_id = '93000000-0000-4000-8000-000000000011'
  ),
  0,
  'badges and pathway positions do not create or alter YM Hub attendance'
);

select * from finish();
rollback;
