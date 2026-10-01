begin;

select plan(7);

insert into auth.users(id, email, email_confirmed_at)
values
  ('99700000-0000-4000-8000-000000000001', 'staff-separation-admin@example.test', now()),
  ('99700000-0000-4000-8000-000000000002', 'staff-separation-target@example.test', now()),
  ('99700000-0000-4000-8000-000000000003', 'staff-not-onboarded@mendaki.org.sg', now());

update core.user_accounts
set status = 'active'
where id in (
  '99700000-0000-4000-8000-000000000001',
  '99700000-0000-4000-8000-000000000002',
  '99700000-0000-4000-8000-000000000003'
);

insert into core.user_roles(user_id, role, granted_by, reason)
values (
  '99700000-0000-4000-8000-000000000001',
  'admin',
  '99700000-0000-4000-8000-000000000001',
  'Staff identity separation regression test'
);

set local role service_role;

select is(
  core.set_staff_access_level(
    '99700000-0000-4000-8000-000000000002',
    'staff',
    '99700000-0000-4000-8000-000000000001'
  ),
  'staff',
  'staff access assignment succeeds'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.user_roles
    where user_id = '99700000-0000-4000-8000-000000000002'
      and role = 'volunteer'
  ),
  0,
  'staff access removes the default volunteer role'
);

select is(
  (
    select count(*)::integer
    from core.user_roles
    where user_id = '99700000-0000-4000-8000-000000000002'
      and role = 'staff'
  ),
  1,
  'staff account retains its staff role'
);

select set_config(
  'request.jwt.claim.sub',
  '99700000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99700000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'staff_account',
  'staff account is excluded from volunteer provisioning'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.volunteers
    where auth_user_id = '99700000-0000-4000-8000-000000000002'
  ),
  0,
  'staff account does not receive a KEL volunteer identity'
);

select set_config(
  'request.jwt.claim.sub',
  '99700000-0000-4000-8000-000000000003',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99700000-0000-4000-8000-000000000003","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'staff_access_required',
  'un-onboarded MENDAKI work email is reserved for staff access'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.volunteers
    where auth_user_id = '99700000-0000-4000-8000-000000000003'
  ),
  0,
  'reserved MENDAKI work email does not receive a KEL volunteer identity'
);

select * from finish();
rollback;
