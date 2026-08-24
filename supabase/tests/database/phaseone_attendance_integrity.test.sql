begin;

select plan(24);

select is(
  public.phaseone_canonical_mobile('+65 9123 4567'),
  '91234567',
  'Singapore country code is removed from local eight-digit numbers'
);

select is(
  public.phaseone_canonical_mobile('0065 9123 4567'),
  '91234567',
  'international 0065 prefix is normalized to the same Singapore number'
);

select is(
  public.phaseone_canonical_mobile('9123-4567'),
  '91234567',
  'local formatting characters are removed from contact numbers'
);

select ok(
  not has_function_privilege(
    'anon',
    'public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot execute quick attendance transitions'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot execute quick attendance transitions directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid)',
    'EXECUTE'
  ),
  'service role can execute quick attendance transitions'
);

insert into auth.users (id, email)
values ('72000000-0000-4000-8000-000000000001', 'integrity-staff@example.test');

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '72000000-0000-4000-8000-000000000002',
  'Attendance integrity test',
  'attendance-integrity-test',
  '72000000-0000-4000-8000-000000000001',
  '72000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '72000000-0000-4000-8000-000000000003',
  '72000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-08-22 01:00:00+00'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_key,
  volunteer_name,
  email,
  mobile,
  uploaded_by
)
values
  (
    '72000000-0000-4000-8000-000000000004',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    'MV-001',
    'Existing Volunteer',
    'linked@example.test',
    '+65 9123 4567',
    '72000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000005',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    null,
    'Checkout Guard',
    'checkout-guard@example.test',
    null,
    '72000000-0000-4000-8000-000000000001'
  ),
  (
    '72000000-0000-4000-8000-000000000006',
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    null,
    'Import Match',
    'import-match@example.test',
    null,
    '72000000-0000-4000-8000-000000000001'
  );

create temporary table integrity_results (
  label text primary key,
  result jsonb not null
);

insert into integrity_results (label, result)
select
  'mobile_duplicate',
  public.phaseone_add_walk_in_volunteer(
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    null,
    'Existing Volunteer',
    null,
    '91234567',
    null,
    false,
    '72000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from integrity_results where label = 'mobile_duplicate'),
  'duplicate',
  'local mobile format matches an existing +65 roster contact'
);

select is(
  (select result->>'roster_id' from integrity_results where label = 'mobile_duplicate'),
  '72000000-0000-4000-8000-000000000004',
  'canonical mobile matching resolves to the existing roster row'
);

insert into integrity_results (label, result)
select
  'email_duplicate',
  public.phaseone_add_walk_in_volunteer(
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    null,
    'Existing Volunteer',
    'LINKED@example.test',
    null,
    null,
    false,
    '72000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'roster_id' from integrity_results where label = 'email_duplicate'),
  '72000000-0000-4000-8000-000000000004',
  'email matches an existing roster row even when that row also has a volunteer ID'
);

select throws_ok(
  $$
    select public.phaseone_add_walk_in_volunteer(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000003',
      'MV-CONFLICT',
      'Existing Volunteer',
      'linked@example.test',
      null,
      null,
      false,
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer ID conflicts with an existing roster record for this shift',
  'a different volunteer ID cannot be merged into an identified roster record via email'
);

insert into integrity_results (label, result)
select
  'existing_check_in',
  public.phaseone_add_walk_in_volunteer(
    '72000000-0000-4000-8000-000000000002',
    '72000000-0000-4000-8000-000000000003',
    null,
    'Existing Volunteer',
    'linked@example.test',
    null,
    null,
    true,
    '72000000-0000-4000-8000-000000000001'
  );

select is(
  (select result->>'status' from integrity_results where label = 'existing_check_in'),
  'duplicate',
  'add-and-check-in recognizes an existing roster assignment'
);

select is(
  (select (result->>'checked_in')::boolean from integrity_results where label = 'existing_check_in'),
  true,
  'add-and-check-in checks in the existing roster assignment'
);

select ok(
  exists (
    select 1
    from public.phaseone_attendance
    where roster_id = '72000000-0000-4000-8000-000000000004'
      and signed_in_at is not null
      and signed_out_at is null
  ),
  'existing roster assignment receives a check-in timestamp'
);

select is(
  (
    select reason
    from public.phaseone_attendance_audit
    where roster_id = '72000000-0000-4000-8000-000000000004'
    order by changed_at desc
    limit 1
  ),
  'Last-minute volunteer matched existing roster and checked in',
  'matched existing check-in is explicit in the audit trail'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'mark_sign_in',
      null,
      'Repeat check-in test',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer is already checked in',
  'quick transition cannot overwrite an existing check-in timestamp'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'mark_sign_out',
      null,
      'Normal check-out test',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'quick transition permits check-out after check-in'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'mark_sign_out',
      null,
      'Repeat check-out test',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer is already checked out',
  'quick transition cannot overwrite an existing check-out timestamp'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_change(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'clear_sign_in',
      null,
      'Invalid clear order test',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Clear check-out before clearing check-in',
  'correction flow cannot leave a check-out without a check-in'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_change(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'clear_sign_out',
      null,
      'Clear check-out first',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'correction flow can clear check-out before clearing check-in'
);

select lives_ok(
  $$
    select public.phaseone_apply_attendance_change(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000004',
      'clear_sign_in',
      null,
      'Clear check-in second',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'correction flow can clear check-in after check-out is clear'
);

select throws_ok(
  $$
    select public.phaseone_apply_attendance_transition(
      '72000000-0000-4000-8000-000000000002',
      '72000000-0000-4000-8000-000000000005',
      'mark_sign_out',
      null,
      'No check-in test',
      '72000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Volunteer must be checked in before check-out',
  'quick transition rejects check-out before check-in'
);

insert into integrity_results (label, result)
select
  'import_match',
  public.phaseone_apply_roster_import(
    '72000000-0000-4000-8000-000000000002',
    'merge',
    'integrity-test.csv',
    jsonb_build_array(
      jsonb_build_object(
        'timeslot_id', '72000000-0000-4000-8000-000000000003',
        'volunteer_key', 'MV-NEW',
        'volunteer_name', 'Import Match Updated',
        'email', 'import-match@example.test',
        'mobile', null,
        'tshirt_size', 'L'
      )
    ),
    '72000000-0000-4000-8000-000000000001'
  );

select is(
  (select (result->>'upserted_count')::integer from integrity_results where label = 'import_match'),
  1,
  'roster import reconciles one matching row by a secondary identifier'
);

select is(
  (
    select volunteer_key
    from public.phaseone_roster
    where id = '72000000-0000-4000-8000-000000000006'
  ),
  'MV-NEW',
  'roster import can attach a newly supplied volunteer ID to a previously ID-less matching row'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster
    where event_id = '72000000-0000-4000-8000-000000000002'
      and timeslot_id = '72000000-0000-4000-8000-000000000003'
      and lower(email) = 'import-match@example.test'
  ),
  1,
  'secondary-identifier reconciliation does not create a duplicate roster row'
);

select * from finish();
rollback;
