begin;

select plan(9);

select has_column(
  'core',
  'volunteers',
  'volunteer_code',
  'volunteers have a KELUARGA volunteer ID'
);

select col_not_null(
  'core',
  'volunteers',
  'volunteer_code',
  'KELUARGA volunteer ID is required'
);

select ok(
  not (
    select attnotnull
    from pg_attribute
    where attrelid = 'core.volunteers'::regclass
      and attname = 'ymhub_volunteer_id'
      and not attisdropped
  ),
  'YM Hub volunteer ID is optional'
);

insert into core.volunteers (display_name, primary_email_normalized)
values ('Keluarga Native Volunteer', 'native@example.test');

select matches(
  (
    select volunteer_code
    from core.volunteers
    where primary_email_normalized = 'native@example.test'
  ),
  '^KEL[0-9]{5}$',
  'new volunteers receive a KEL plus five digits identifier'
);

select isnt(
  (
    select volunteer_code
    from core.volunteers
    where primary_email_normalized = 'native@example.test'
  ),
  'KEL00000',
  'KEL00000 is reserved'
);

select throws_ok(
  $$
    update core.volunteers
    set volunteer_code = 'KEL99999'
    where primary_email_normalized = 'native@example.test'
  $$,
  'P0001',
  'KELUARGA volunteer ID is immutable',
  'KELUARGA volunteer IDs cannot be changed'
);

update core.volunteers
set ymhub_volunteer_id = 'YMHUB-LATER-001'
where primary_email_normalized = 'native@example.test';

select is(
  (
    select ymhub_volunteer_id
    from core.volunteers
    where primary_email_normalized = 'native@example.test'
  ),
  'YMHUB-LATER-001',
  'YM Hub reconciliation ID may be assigned later'
);

select throws_ok(
  $$
    update core.volunteers
    set ymhub_volunteer_id = 'YMHUB-LATER-002'
    where primary_email_normalized = 'native@example.test'
  $$,
  'P0001',
  'YM Hub volunteer ID is immutable once assigned',
  'YM Hub reconciliation ID cannot be replaced after assignment'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.next_volunteer_code()',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot generate arbitrary KELUARGA IDs'
);

select * from finish();
rollback;
