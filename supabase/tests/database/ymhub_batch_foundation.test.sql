begin;

select plan(37);

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

select has_function(
  'core',
  'apply_ymhub_import_batch',
  array['date','date','uuid','text','jsonb','jsonb','jsonb','jsonb','jsonb','jsonb'],
  'atomic YM Hub import function exists'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'core.apply_ymhub_import_batch(date,date,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'ordinary authenticated users cannot execute the inbound importer'
);
select ok(
  has_function_privilege(
    'service_role',
    'core.apply_ymhub_import_batch(date,date,uuid,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'service role can execute the inbound importer'
);

set local role service_role;
select is(
  (
    core.apply_ymhub_import_batch(
      '2026-09-01'::date,
      '2026-09-30'::date,
      null,
      'test-v1',
      jsonb_build_array(
        jsonb_build_object('dataset','person_accounts','file_name','people.csv','sha256',repeat('1',64),'row_count',1,'exception_count',0),
        jsonb_build_object('dataset','volunteer_initiatives','file_name','initiatives.csv','sha256',repeat('2',64),'row_count',1,'exception_count',0),
        jsonb_build_object('dataset','job_position_shifts','file_name','shifts.csv','sha256',repeat('3',64),'row_count',1,'exception_count',0),
        jsonb_build_object('dataset','job_position_assignments','file_name','assignments.csv','sha256',repeat('4',64),'row_count',1,'exception_count',0)
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ymhub_volunteer_id','001TEST000000000001',
          'display_name','Synthetic Volunteer',
          'primary_email_normalized','synthetic@example.test',
          'mobile','80000000',
          'official_hours_12_months',3.5,
          'official_hours_24_months',8
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ymhub_activity_id','1RVTEST00000000001',
          'title','Synthetic Initiative',
          'is_ad_hoc',true,
          'starts_on','2026-09-15',
          'ends_on','2026-09-15',
          'source_status','Upcoming',
          'published',true
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ymhub_shift_id','1QyTEST00000000001',
          'ymhub_activity_id','1RVTEST00000000001',
          'job_position_name','Packing Staff',
          'starts_at','2026-09-15T09:00:00+08:00',
          'ends_at','2026-09-15T11:00:00+08:00'
        )
      ),
      jsonb_build_array(
        jsonb_build_object(
          'ymhub_assignment_id','1SuTEST00000000001',
          'ymhub_volunteer_id','001TEST000000000001',
          'ymhub_activity_id','1RVTEST00000000001',
          'ymhub_shift_id','1QyTEST00000000001',
          'source_status','Approved',
          'actual_duration',2
        )
      ),
      '[]'::jsonb
    ) ->> 'status'
  ),
  'committed',
  'a valid four-file batch commits atomically'
);
reset role;

select is(
  (select account_access_eligible from core.volunteers where ymhub_volunteer_id = '001TEST000000000001'),
  true,
  'Person Account import enables KELUARGA account eligibility'
);
select is(
  (select source_updated_at from core.volunteers where ymhub_volunteer_id = '001TEST000000000001'),
  null::timestamptz,
  'importer does not invent a Salesforce source updated timestamp'
);
select is(
  (select is_ad_hoc from ymhub.activity_snapshots where ymhub_activity_id = '1RVTEST00000000001'),
  true,
  'Is Ad Hoc is retained as a dedicated source boolean'
);
select is(
  (select shift_label from ymhub.shift_snapshots where ymhub_shift_id = '1QyTEST00000000001'),
  null::text,
  'Job Position Name is not falsely stored as a shift label'
);
select is(
  (select source_status from ymhub.assignment_snapshots where ymhub_assignment_id = '1SuTEST00000000001'),
  'Approved',
  'raw Job Position Assignment status is preserved'
);
select is(
  (
    select period_start::text || ':' || period_end::text
    from integration.ymhub_import_batches
    where status = 'committed'
    order by committed_at desc
    limit 1
  ),
  '2026-09-01:2026-09-30',
  'batch history stores the staff-selected reporting period'
);

set local role service_role;
select throws_ok(
  $$
    select core.apply_ymhub_import_batch(
      '2026-09-01'::date,
      '2026-09-30'::date,
      null,
      'test-v1',
      jsonb_build_array(
        jsonb_build_object('dataset','person_accounts','file_name','people.csv','sha256',repeat('1',64),'row_count',1,'exception_count',0),
        jsonb_build_object('dataset','volunteer_initiatives','file_name','initiatives-new.csv','sha256',repeat('5',64),'row_count',0,'exception_count',0),
        jsonb_build_object('dataset','job_position_shifts','file_name','shifts-new.csv','sha256',repeat('6',64),'row_count',0,'exception_count',0),
        jsonb_build_object('dataset','job_position_assignments','file_name','assignments-new.csv','sha256',repeat('7',64),'row_count',0,'exception_count',0)
      ),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb
    )
  $$,
  '23505',
  'One or more YM Hub files have already been imported',
  'a repeated report checksum is rejected before a duplicate batch is created'
);
reset role;

select * from finish();
rollback;
