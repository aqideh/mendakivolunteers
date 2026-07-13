begin;

select plan(16);

select has_schema('core', 'core schema exists');
select has_schema('audit', 'audit schema exists');
select has_schema('integration', 'integration schema exists');
select has_table('core', 'user_accounts', 'user accounts table exists');
select has_table('core', 'volunteers', 'volunteers table exists');
select has_table('core', 'user_roles', 'user roles table exists');
select has_table('core', 'account_link_cases', 'account link cases table exists');
select has_table('audit', 'events', 'audit events table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'core.volunteers'::regclass
  ),
  'volunteers has forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'core.user_accounts'::regclass
  ),
  'user accounts has forced row-level security'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'core'
      and tablename = 'volunteers'
  ),
  2,
  'volunteers has self and support read policies'
);

select ok(
  has_table_privilege('authenticated', 'core.volunteers', 'SELECT'),
  'authenticated users have SELECT on volunteers'
);

select ok(
  not has_table_privilege('authenticated', 'core.volunteers', 'INSERT'),
  'authenticated users cannot INSERT volunteers'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.has_role(core.app_role)',
    'EXECUTE'
  ),
  'authenticated users can execute the role predicate'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.handle_new_auth_user()',
    'EXECUTE'
  ),
  'authenticated users cannot execute the auth trigger function'
);

select ok(
  not has_schema_privilege('authenticated', 'audit', 'USAGE'),
  'authenticated users cannot access the audit schema'
);

select * from finish();
rollback;
