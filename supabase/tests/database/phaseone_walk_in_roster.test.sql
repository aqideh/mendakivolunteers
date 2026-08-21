begin;

select plan(14);

select has_column(
  'public',
  'phaseone_roster',
  'entry_method',
  'roster assignments record whether they were imported or added on site'
);

insert into auth.users (id, email)
values (
  '71000000-0000-4000-8000-000000000001',
  'walk-in-staff@example.test'
);

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '71000000-0000-4000-8000-000000000002',
  'Walk-in roster test',
  'walk-in-roster-test',
  '71000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '71000000-0000-4000-8000-000000000003',
  '71000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-08-21 01:00:00+00'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_name,
  uploaded_by
)
values (
  '71000000-0000-4000-8000-000000000004',
  '71000000-0000-4000-8000-000000000002',
  '71000000-0000-4000-8000-000000000003',
  'Imported Volunteer',
  '71000000-0000-4000-8000-000000000001'
);

select is(
  (
    select entry_method
    from public.phaseone_roster
    where id = '71000000-0000-4000-8000-000000000004'
  ),
  'roster_import',
  'existing roster inserts default to roster_import'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.phaseone_add_walk_in_volunteer(uuid, uuid, text, text, text, text, text, boolean, uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot add walk-in volunteers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_add_walk_in_volunteer(uuid, uuid, text, text, text, text, text, boolean, uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot directly add walk-in volunteers'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_add_walk_in_volunteer(uuid, uuid, text, text, text, text, text, boolean, uuid)',
    'EXECUTE'
  ),
  'service role can add walk-in volunteers'
);

create temporary table walk_in_results (
  label text primary key,
  result jsonb not null
);

insert into walk_in_results (label, result)
select
  'checked_in',
  public.phaseone_add_walk_in_volunteer(
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000003',
    null,
    'Last Minute Volunteer',
    null,
    '+65 9123 4567',
    'M',
    true,
    '71000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from walk_in_results where label = 'checked_in'),
  'created',
  'a new walk-in roster assignment is created'
);

select is(
  (select (result->>'checked_in')::boolean from walk_in_results where label = 'checked_in'),
  true,
  'add and check in records the requested immediate check-in'
);

select is(
  (
    select entry_method
    from public.phaseone_roster
    where id = (
      select (result->>'roster_id')::uuid
      from walk_in_results
      where label = 'checked_in'
    )
  ),
  'walk_in',
  'last-minute additions are marked as walk-ins'
);

select ok(
  exists (
    select 1
    from public.phaseone_attendance
    where roster_id = (
      select (result->>'roster_id')::uuid
      from walk_in_results
      where label = 'checked_in'
    )
      and signed_in_at is not null
  ),
  'immediate walk-in check-in creates an attendance timestamp'
);

select is(
  (
    select reason
    from public.phaseone_attendance_audit
    where roster_id = (
      select (result->>'roster_id')::uuid
      from walk_in_results
      where label = 'checked_in'
    )
    order by changed_at desc
    limit 1
  ),
  'Last-minute volunteer added and checked in',
  'walk-in check-in is explicitly identified in the attendance audit'
);

insert into walk_in_results (label, result)
select
  'duplicate',
  public.phaseone_add_walk_in_volunteer(
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000003',
    null,
    'Last Minute Volunteer',
    null,
    '91234567',
    'M',
    true,
    '71000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from walk_in_results where label = 'duplicate'),
  'duplicate',
  'the same normalized mobile number is detected as an existing shift assignment'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster
    where event_id = '71000000-0000-4000-8000-000000000002'
      and timeslot_id = '71000000-0000-4000-8000-000000000003'
      and roster_match_key = 'mobile:91234567'
  ),
  1,
  'duplicate walk-in submission does not create another roster row'
);

insert into walk_in_results (label, result)
select
  'roster_only',
  public.phaseone_add_walk_in_volunteer(
    '71000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000003',
    null,
    'Roster Only Volunteer',
    'roster-only@example.test',
    null,
    null,
    false,
    '71000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from walk_in_results where label = 'roster_only'),
  'created',
  'staff can add a walk-in without checking them in immediately'
);

select ok(
  not exists (
    select 1
    from public.phaseone_attendance
    where roster_id = (
      select (result->>'roster_id')::uuid
      from walk_in_results
      where label = 'roster_only'
    )
  ),
  'roster-only walk-in does not create attendance until staff checks them in'
);

select * from finish();
rollback;
