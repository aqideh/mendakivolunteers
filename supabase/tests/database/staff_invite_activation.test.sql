begin;

select plan(11);

select ok(
  to_regprocedure('core.activate_current_staff_account()') is not null,
  'authenticated staff activation function exists'
);

select ok(
  to_regprocedure('core.activate_staff_account_after_setup(uuid)') is not null,
  'server-side staff activation function exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.activate_current_staff_account()',
    'EXECUTE'
  ),
  'authenticated users can request activation for their own staff account'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.activate_staff_account_after_setup(uuid)',
    'EXECUTE'
  ),
  'browser users cannot activate arbitrary staff accounts'
);

select ok(
  has_function_privilege(
    'service_role',
    'core.activate_staff_account_after_setup(uuid)',
    'EXECUTE'
  ),
  'service role can finish legacy setup-token activation'
);

insert into auth.users(id, email, email_confirmed_at)
values
  (
    '69000000-0000-4000-8000-000000000001',
    'invite-admin@example.test',
    now()
  ),
  (
    '69000000-0000-4000-8000-000000000002',
    'ordinary-volunteer@example.test',
    now()
  );

insert into core.user_roles(user_id, role, reason)
values (
  '69000000-0000-4000-8000-000000000001',
  'admin',
  'Staff invite activation regression'
);

select is(
  (
    select status::text
    from core.user_accounts
    where id = '69000000-0000-4000-8000-000000000001'
  ),
  'pending_link',
  'invited staff account begins pending'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '69000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select is(
  core.activate_current_staff_account(),
  'activated',
  'invited staff member can activate their own approved staff account'
);

select is(
  core.activate_current_staff_account(),
  'already_active',
  'staff activation is idempotent'
);

reset role;

select is(
  (
    select status::text
    from core.user_accounts
    where id = '69000000-0000-4000-8000-000000000001'
  ),
  'active',
  'activation changes the staff account to active'
);

select set_config(
  'request.jwt.claims',
  '{"sub":"69000000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
select set_config(
  'request.jwt.claim.sub',
  '69000000-0000-4000-8000-000000000002',
  true
);
set local role authenticated;

select is(
  core.activate_current_staff_account(),
  'not_staff',
  'ordinary volunteers cannot promote themselves through staff activation'
);

reset role;

select is(
  (
    select status::text
    from core.user_accounts
    where id = '69000000-0000-4000-8000-000000000002'
  ),
  'pending_link',
  'ordinary volunteer account remains pending after rejected staff activation'
);

select * from finish();
rollback;
