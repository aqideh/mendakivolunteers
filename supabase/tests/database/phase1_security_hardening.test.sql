begin;

select plan(3);

select has_trigger(
  'core',
  'volunteers',
  'volunteers_prevent_external_id_change',
  'YM Hub volunteer IDs have an immutability trigger'
);

select throws_ok(
  $$
    update core.volunteers
    set ymhub_volunteer_id = 'PROTO-VOL-CHANGED'
    where ymhub_volunteer_id = 'PROTO-VOL-000001'
  $$,
  'P0001',
  'YM Hub volunteer ID is immutable',
  'YM Hub volunteer IDs cannot be changed in place'
);

select ok(
  (
    select qual::text like '%is_current_account_active%'
    from pg_policies
    where schemaname = 'core'
      and tablename = 'volunteers'
      and policyname = 'volunteers_select_self'
  ),
  'self-service volunteer access requires an active account'
);

select * from finish();
rollback;
