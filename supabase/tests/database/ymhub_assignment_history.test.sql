begin;

select plan(4);

select has_column(
  'ymhub',
  'assignment_snapshots',
  'ymhub_volunteer_id',
  'assignments retain the Salesforce Person Account ID independently of an app link'
);

insert into ymhub.assignment_snapshots (
  ymhub_assignment_id,
  ymhub_volunteer_id,
  volunteer_id,
  ymhub_activity_id,
  ymhub_shift_id,
  source_status,
  actual_duration,
  last_imported_at
) values (
  '1SuTEST00000009999',
  '001TEST000000099999',
  null,
  '1RVTEST00000009999',
  '1QyTEST00000009999',
  'Rejected',
  null,
  now()
);

select is(
  (
    select ymhub_volunteer_id
    from ymhub.assignment_snapshots
    where ymhub_assignment_id = '1SuTEST00000009999'
  ),
  '001TEST000000099999',
  'an unresolved historical assignment retains its source volunteer ID'
);

select is(
  (
    select volunteer_id
    from ymhub.assignment_snapshots
    where ymhub_assignment_id = '1SuTEST00000009999'
  ),
  null::uuid,
  'an unresolved assignment does not require a current core volunteer row'
);

select is(
  (
    select ymhub_shift_id
    from ymhub.assignment_snapshots
    where ymhub_assignment_id = '1SuTEST00000009999'
  ),
  '1QyTEST00000009999',
  'an assignment retains a shift ID even when that shift is outside the current published report'
);

select * from finish();
rollback;
