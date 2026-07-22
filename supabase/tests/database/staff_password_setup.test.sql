begin;

select plan(19);

select has_table(
  'core',
  'staff_password_setup_tokens',
  'staff password setup token table exists'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'core.staff_password_setup_tokens'::regclass
  ),
  'staff password setup tokens have forced row-level security'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.staff_password_setup_tokens',
    'SELECT'
  ),
  'authenticated users cannot read password setup tokens'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'core.staff_password_setup_tokens',
    'INSERT'
  ),
  'authenticated users cannot insert password setup tokens'
);

select ok(
  has_table_privilege(
    'service_role',
    'core.staff_password_setup_tokens',
    'SELECT'
  ),
  'service role can read password setup tokens'
);

select ok(
  to_regprocedure(
    'core.issue_staff_password_setup_token(uuid,text,uuid,timestamp with time zone)'
  ) is not null,
  'staff password setup token issuer exists'
);

select ok(
  to_regprocedure('core.consume_staff_password_setup_token(text)') is not null,
  'staff password setup token consumer exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.issue_staff_password_setup_token(uuid,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'authenticated users cannot issue staff password setup tokens'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.consume_staff_password_setup_token(text)',
    'EXECUTE'
  ),
  'authenticated users cannot consume staff password setup tokens directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'core.issue_staff_password_setup_token(uuid,text,uuid,timestamp with time zone)',
    'EXECUTE'
  ),
  'service role can issue staff password setup tokens'
);

select ok(
  has_function_privilege(
    'service_role',
    'core.consume_staff_password_setup_token(text)',
    'EXECUTE'
  ),
  'service role can consume staff password setup tokens'
);

insert into auth.users (id, email)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'staff-setup-admin@example.test'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'staff-setup-manager@example.test'
  );

update core.user_accounts
set status = 'active'
where id in (
  '60000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000002'
);

insert into core.user_roles (user_id, role, reason)
values
  (
    '60000000-0000-4000-8000-000000000001',
    'admin',
    'Staff password setup database test'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    'attendance_manager',
    'Staff password setup database test'
  );

set local role service_role;

select throws_ok(
  $$
    select core.issue_staff_password_setup_token(
      '60000000-0000-4000-8000-000000000002',
      'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      '60000000-0000-4000-8000-000000000002',
      now() + interval '1 hour'
    )
  $$,
  '42501',
  'Only active administrators can issue staff password setup links',
  'non-admin staff cannot issue setup links'
);

select ok(
  core.issue_staff_password_setup_token(
    '60000000-0000-4000-8000-000000000002',
    'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
    '60000000-0000-4000-8000-000000000001',
    now() + interval '1 hour'
  ) is not null,
  'administrator can issue a setup link'
);

select is(
  (
    select count(*)::integer
    from core.staff_password_setup_tokens
    where user_id = '60000000-0000-4000-8000-000000000002'
      and consumed_at is null
      and revoked_at is null
  ),
  1,
  'one active token exists after first issuance'
);

select ok(
  core.issue_staff_password_setup_token(
    '60000000-0000-4000-8000-000000000002',
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
    '60000000-0000-4000-8000-000000000001',
    now() + interval '1 hour'
  ) is not null,
  'administrator can replace an existing setup link'
);

select is(
  (
    select count(*)::integer
    from core.staff_password_setup_tokens
    where user_id = '60000000-0000-4000-8000-000000000002'
      and consumed_at is null
      and revoked_at is null
  ),
  1,
  'replacement leaves exactly one active token'
);

select is(
  (
    select count(*)::integer
    from core.staff_password_setup_tokens
    where user_id = '60000000-0000-4000-8000-000000000002'
      and revoked_at is not null
  ),
  1,
  'replacement revokes the previous token'
);

select is(
  core.consume_staff_password_setup_token(
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  )::text,
  '60000000-0000-4000-8000-000000000002',
  'valid token is consumed for its staff account'
);

select ok(
  core.consume_staff_password_setup_token(
    'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'
  ) is null,
  'consumed token cannot be reused'
);

select * from finish();
rollback;
