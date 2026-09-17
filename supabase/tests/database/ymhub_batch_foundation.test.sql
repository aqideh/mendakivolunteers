begin;

select plan(26);

select has_schema('integration', 'private integration schema exists');
select has_table('integration', 'ymhub_import_batches', 'YM Hub import batch history exists');
select has_table('integration', 'ymhub_import_files', 'YM Hub import file history exists');
select has_table('integration', 'ymhub_import_exceptions', 'YM Hub import exception queue exists');
select has_table('integration', 'ymhub_export_batches', 'YM Hub attendance export history exists');
select has_table('integration', 'ymhub_export_rows', 'YM Hub attendance export rows exist');
select has_table('ymhub', 'activity_snapshots', 'Volunteer Initiative projection exists');
select has_table('ymhub', 'shift_snapshots', 'Job Position Shift projection exists');
select has_table('ymhub', 'assignment_snapshots', 'Job Position Assignment projection exists');

select has_column('core', 'volunteers', 'mobile', 'volunteer projection stores YM Hub mobile');
select has_column('core', 'volunteers', 'official_hours_12_months', 'volunteer projection stores rolling 12-month hours');
select has_column('core', 'volunteers', 'official_hours_24_months', 'volunteer projection stores rolling 24-month hours');
select has_column('public', 'phaseone_event_timeslots', 'ymhub_shift_id', 'event timeslots can link to YM Hub shifts');
select has_column('public', 'phaseone_roster', 'volunteer_id', 'roster rows can link to canonical volunteers');
select has_column('public', 'phaseone_roster', 'ymhub_assignment_id', 'roster rows retain Job Position Assignment IDs');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'integration.ymhub_import_batches'::regclass
  ),
  'batch history has forced row-level security'
);
select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'ymhub.assignment_snapshots'::regclass
  ),
  'raw assignment projection has forced row-level security'
);

select ok(
  not has_table_privilege('authenticated', 'integration.ymhub_import_batches', 'SELECT'),
  'ordinary authenticated users cannot read private batch history'
);
select ok(
  not has_table_privilege('authenticated', 'ymhub.assignment_snapshots', 'SELECT'),
  'ordinary authenticated users cannot read raw assignment snapshots'
);
select ok(
  has_table_privilege('service_role', 'integration.ymhub_import_batches', 'SELECT'),
  'service role can read batch history'
);
select ok(
  has_table_privilege('service_role', 'ymhub.assignment_snapshots', 'SELECT'),
  'service role can read canonical assignment snapshots'
);

select has_function(
  'core',
  'get_ymhub_batch_summary',
  array[]::text[],
  'server-only Batch Centre summary function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'core.get_ymhub_batch_summary()',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot call the Batch Centre summary directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'core.get_ymhub_batch_summary()',
    'EXECUTE'
  ),
  'service role can call the Batch Centre summary'
);

select has_column(
  'ymhub',
  'assignment_snapshots',
  'source_status',
  'canonical assignments retain raw Salesforce status'
);
select has_column(
  'ymhub',
  'activity_snapshots',
  'published',
  'Volunteer Initiative projection retains Published true/false'
);

select * from finish();
rollback;
