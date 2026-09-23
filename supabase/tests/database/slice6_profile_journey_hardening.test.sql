begin;

select plan(10);

insert into auth.users (id, email, email_confirmed_at)
values
  ('94000000-0000-4000-8000-000000000001', 'slice6-hardening-volunteer@example.test', now()),
  ('94000000-0000-4000-8000-000000000002', 'slice6-hardening-manager@example.test', now());

insert into core.volunteers (
  id,
  auth_user_id,
  display_name,
  primary_email_normalized,
  mobile
)
values
  (
    '94000000-0000-4000-8000-000000000011',
    '94000000-0000-4000-8000-000000000001',
    'Slice Six Hardening Volunteer',
    'slice6-hardening-volunteer@example.test',
    '81230011'
  ),
  (
    '94000000-0000-4000-8000-000000000012',
    '94000000-0000-4000-8000-000000000002',
    'Slice Six Hardening Manager',
    'slice6-hardening-manager@example.test',
    '81230012'
  );

update core.user_accounts
set status = 'active'
where id in (
  '94000000-0000-4000-8000-000000000001',
  '94000000-0000-4000-8000-000000000002'
);

insert into core.user_roles (user_id, role, reason)
values (
  '94000000-0000-4000-8000-000000000002',
  'pathway_manager',
  'Slice 6 hardening regression test'
)
on conflict (user_id, role) do nothing;

select set_config(
  'request.jwt.claim.sub',
  '94000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"94000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

create temporary table slice6_hardening_ids (
  kind text primary key,
  id uuid not null
);
grant select, insert, update, delete on slice6_hardening_ids to authenticated;

insert into slice6_hardening_ids (kind, id)
values (
  'first_position',
  pathways.assign_volunteer_position(
    '94000000-0000-4000-8000-000000000011',
    (
      select stage.id
      from pathways.stages as stage
      join pathways.map_versions as version on version.id = stage.version_id
      join pathways.maps as pathway_map on pathway_map.active_version_id = version.id
      where stage.stable_key = 'mentor.contribute'
      limit 1
    ),
    'Reviewed mentoring evidence supports this position.',
    'Hardening regression test.'
  )
);

select ok(
  (select id from slice6_hardening_ids where kind = 'first_position') is not null,
  'pathway manager can assign a reviewed position'
);

select is(
  pathways.assign_volunteer_position(
    '94000000-0000-4000-8000-000000000011',
    (
      select stage.id
      from pathways.stages as stage
      join pathways.map_versions as version on version.id = stage.version_id
      join pathways.maps as pathway_map on pathway_map.active_version_id = version.id
      where stage.stable_key = 'mentor.contribute'
      limit 1
    ),
    'Repeated submission must not create duplicate history.',
    'Second submission.'
  ),
  (select id from slice6_hardening_ids where kind = 'first_position'),
  'repeating the same active stage assignment is idempotent'
);

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '94000000-0000-4000-8000-000000000011'
      and ended_at is null
  ),
  0,
  'pathway manager browser session cannot directly read another volunteer position'
);

reset role;

select is(
  (
    select count(*)::integer
    from pathways.volunteer_positions
    where volunteer_id = '94000000-0000-4000-8000-000000000011'
  ),
  1,
  'idempotent reassignment keeps one history row'
);

select is(
  (
    select count(*)::integer
    from audit.events
    where action = 'pathway.position_assigned'
      and target_id = '94000000-0000-4000-8000-000000000011'
  ),
  1,
  'idempotent reassignment creates one assignment audit event'
);

select has_index(
  'gamification',
  'badge_definitions',
  'badge_definitions_created_by_idx',
  'badge creator foreign key has a covering index'
);

select has_index(
  'gamification',
  'volunteer_badges',
  'volunteer_badges_badge_id_idx',
  'badge award definition foreign key has a covering index'
);

select has_index(
  'pathways',
  'volunteer_positions',
  'volunteer_positions_map_id_idx',
  'pathway map foreign key has a covering index'
);

select has_index(
  'pathways',
  'volunteer_positions',
  'volunteer_positions_assigned_version_id_idx',
  'pathway version foreign key has a covering index'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'pathways'
      and tablename = 'volunteer_positions'
      and policyname = 'volunteer_positions_select_self'
  )
  and not exists (
    select 1
    from pg_policies
    where schemaname = 'pathways'
      and tablename = 'volunteer_positions'
      and policyname = 'volunteer_positions_select_self_or_manager'
  ),
  'pathway position RLS uses the self-only policy'
);

select * from finish();
rollback;
