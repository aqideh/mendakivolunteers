begin;

select plan(7);

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


select has_function(
  'public',
  'phaseone_relink_roster_volunteer',
  array['uuid','uuid','uuid','uuid'],
  'roster volunteer identity relink RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_relink_roster_volunteer(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot relink roster identities directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_relink_roster_volunteer(uuid,uuid,uuid,uuid)',
    'EXECUTE'
  ),
  'service role can execute roster identity relink RPC'
);

insert into auth.users (id, email)
values ('73000000-0000-4000-8000-000000000001', 'roster-service-role@example.test');

set local role service_role;
select lives_ok(
  $$
    select id
    from auth.users
    where id = '73000000-0000-4000-8000-000000000001'
  $$,
  'service role can perform the auth user ID lookup used by roster and attendance RPCs'
);
reset role;

select * from finish();
rollback;
