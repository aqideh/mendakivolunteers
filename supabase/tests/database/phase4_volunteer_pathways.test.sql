begin;

select plan(37);

select has_schema('pathways', 'pathways schema exists');
select has_table('pathways', 'maps', 'pathway maps table exists');
select has_table('pathways', 'map_versions', 'pathway versions table exists');
select has_table('pathways', 'phases', 'pathway phases table exists');
select has_table('pathways', 'tracks', 'pathway tracks table exists');
select has_table('pathways', 'stages', 'pathway stages table exists');
select has_table('pathways', 'stage_roles', 'pathway stage roles table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.maps'::regclass
  ),
  'pathway maps have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.map_versions'::regclass
  ),
  'pathway versions have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.phases'::regclass
  ),
  'pathway phases have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.tracks'::regclass
  ),
  'pathway tracks have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.stages'::regclass
  ),
  'pathway stages have forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'pathways.stage_roles'::regclass
  ),
  'pathway stage roles have forced row-level security'
);

select ok(
  has_table_privilege('anon', 'pathways.maps', 'SELECT'),
  'anonymous users can read the published pathway map'
);
select ok(
  not has_table_privilege('anon', 'pathways.maps', 'INSERT'),
  'anonymous users cannot create pathway maps'
);
select ok(
  has_table_privilege('authenticated', 'pathways.map_versions', 'SELECT'),
  'authenticated users can read pathway versions permitted by RLS'
);
select ok(
  not has_table_privilege('authenticated', 'pathways.map_versions', 'UPDATE'),
  'authenticated users cannot directly update pathway versions'
);
select ok(
  has_function_privilege(
    'authenticated',
    'pathways.create_draft_from_active(uuid)',
    'EXECUTE'
  ),
  'authenticated users can invoke the role-gated draft function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'pathways.save_draft(uuid,jsonb)',
    'EXECUTE'
  ),
  'authenticated users can invoke the role-gated save function'
);
select ok(
  has_function_privilege(
    'authenticated',
    'pathways.publish_draft(uuid)',
    'EXECUTE'
  ),
  'authenticated users can invoke the role-gated publish function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'pathways.require_manager()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the internal authorization function'
);

select is(
  (select count(*)::integer from pathways.maps),
  1,
  'one default pathway map is seeded'
);
select is(
  (
    select count(*)::integer
    from pathways.map_versions
    where status = 'published'
  ),
  1,
  'one published pathway version is seeded'
);
select is(
  (select count(*)::integer from pathways.phases),
  5,
  'five pathway phases are seeded'
);
select is(
  (select count(*)::integer from pathways.tracks),
  4,
  'four pathway tracks are seeded'
);
select is(
  (select count(*)::integer from pathways.stages),
  20,
  'twenty pathway stages are seeded'
);
select is(
  (select count(*)::integer from pathways.stage_roles),
  35,
  'stage role options are stored separately from display titles'
);

select throws_ok(
  $$
    update pathways.map_versions
    set name = 'Changed after publication'
    where status = 'published'
  $$,
  'P0001',
  'Published pathway versions may only be archived',
  'published pathway versions are immutable'
);


insert into auth.users (id, email)
values (
  '60000000-0000-4000-8000-000000000002',
  'pathway-volunteer@example.test'
);

update core.user_accounts
set status = 'active'
where id = '60000000-0000-4000-8000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    select pathways.create_draft_from_active(
      (select id from pathways.maps where slug = 'volunteer-pathways')
    )
  $$,
  '42501',
  'Pathway manager access required',
  'ordinary volunteers cannot create pathway drafts'
);

reset role;

insert into auth.users (id, email)
values (
  '60000000-0000-4000-8000-000000000001',
  'pathway-manager@example.test'
);

update core.user_accounts
set status = 'active'
where id = '60000000-0000-4000-8000-000000000001';

insert into core.user_roles (user_id, role, reason)
values (
  '60000000-0000-4000-8000-000000000001',
  'pathway_manager',
  'Volunteer pathways database test'
);

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

select lives_ok(
  $$
    select pathways.create_draft_from_active(
      (select id from pathways.maps where slug = 'volunteer-pathways')
    )
  $$,
  'a pathway manager can create a draft from the active version'
);
select is(
  (
    select count(*)::integer
    from pathways.map_versions
    where status = 'draft'
  ),
  1,
  'one editable draft is created'
);
select is(
  (
    select count(*)::integer
    from pathways.stages
    where version_id = (
      select id
      from pathways.map_versions
      where status = 'draft'
    )
  ),
  20,
  'the draft contains a complete cloned stage grid'
);

reset role;
select set_config(
  'request.jwt.claim.sub',
  '60000000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"60000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  (
    select count(*)::integer
    from pathways.map_versions
    where status = 'draft'
  ),
  0,
  'ordinary volunteers cannot read staff pathway drafts'
);

reset role;
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

select lives_ok(
  $$
    select pathways.publish_draft(
      (select id from pathways.map_versions where status = 'draft')
    )
  $$,
  'a complete pathway draft can be published atomically'
);
select is(
  (
    select version.version_number
    from pathways.maps as pathway_map
    join pathways.map_versions as version
      on version.id = pathway_map.active_version_id
    where pathway_map.slug = 'volunteer-pathways'
  ),
  2,
  'the newly published version becomes active'
);
select is(
  (
    select count(*)::integer
    from pathways.map_versions
    where version_number = 1
      and status = 'archived'
  ),
  1,
  'the previous published version is archived'
);
select is(
  (
    select count(*)::integer
    from pathways.map_versions
    where status = 'draft'
  ),
  0,
  'publishing leaves no open draft'
);

select * from finish();
rollback;
