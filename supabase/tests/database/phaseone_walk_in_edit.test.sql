begin;

select plan(8);

insert into auth.users (id, email)
values ('79000000-0000-4000-8000-000000000001', 'walk-in-editor@example.test');

insert into public.phaseone_events (id, title, slug, created_by, updated_by)
values (
  '79000000-0000-4000-8000-000000000002',
  'Walk-in edit test',
  'walk-in-edit-test',
  '79000000-0000-4000-8000-000000000001',
  '79000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id, event_id, label, starts_at)
values
  ('79000000-0000-4000-8000-000000000003', '79000000-0000-4000-8000-000000000002', 'AM', '2026-09-15 01:00:00+00'),
  ('79000000-0000-4000-8000-000000000004', '79000000-0000-4000-8000-000000000002', 'PM', '2026-09-15 05:00:00+00');

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_name, mobile, entry_method, uploaded_by
) values (
  '79000000-0000-4000-8000-000000000005',
  '79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003',
  'Typo Volunter',
  '9123 4567',
  'walk_in',
  '79000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_name, mobile, entry_method, attendance_person_key, uploaded_by
)
select
  '79000000-0000-4000-8000-000000000006',
  event_id,
  '79000000-0000-4000-8000-000000000004',
  volunteer_name,
  mobile,
  'walk_in',
  attendance_person_key,
  '79000000-0000-4000-8000-000000000001'
from public.phaseone_roster
where id = '79000000-0000-4000-8000-000000000005';

select ok(
  not has_function_privilege(
    'anon',
    'public.phaseone_update_walk_in_volunteer(uuid, uuid, text, text, text, uuid)',
    'EXECUTE'
  ),
  'anonymous clients cannot edit walk-in volunteers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_update_walk_in_volunteer(uuid, uuid, text, text, text, uuid)',
    'EXECUTE'
  ),
  'authenticated clients cannot directly edit walk-in volunteers'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_update_walk_in_volunteer(uuid, uuid, text, text, text, uuid)',
    'EXECUTE'
  ),
  'service role can edit walk-in volunteers'
);

create temporary table walk_in_edit_before as
select attendance_person_key
from public.phaseone_roster
where id = '79000000-0000-4000-8000-000000000005';

select public.phaseone_update_walk_in_volunteer(
  '79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000005',
  'Typo Volunteer',
  'corrected@example.test',
  '92345678',
  '79000000-0000-4000-8000-000000000001'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster
    where event_id = '79000000-0000-4000-8000-000000000002'
      and volunteer_name = 'Typo Volunteer'
      and email = 'corrected@example.test'
      and mobile = '92345678'
  ),
  2,
  'corrected walk-in details propagate across linked event shifts'
);

select is(
  (
    select count(distinct attendance_person_key)::integer
    from public.phaseone_roster
    where id in (
      '79000000-0000-4000-8000-000000000005',
      '79000000-0000-4000-8000-000000000006'
    )
  ),
  1,
  'linked walk-in shifts retain one stable attendance identity'
);

select is(
  (
    select attendance_person_key
    from public.phaseone_roster
    where id = '79000000-0000-4000-8000-000000000005'
  ),
  (select attendance_person_key from walk_in_edit_before),
  'adding a corrected email does not rewrite the walk-in event identity'
);

select is(
  (
    select affected_rows
    from public.phaseone_roster_edit_audit
    where roster_id = '79000000-0000-4000-8000-000000000005'
    order by changed_at desc
    limit 1
  ),
  2,
  'walk-in correction is audit logged with the number of linked rows changed'
);

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_name, email, uploaded_by
) values (
  '79000000-0000-4000-8000-000000000007',
  '79000000-0000-4000-8000-000000000002',
  '79000000-0000-4000-8000-000000000003',
  'Imported Volunteer',
  'imported@example.test',
  '79000000-0000-4000-8000-000000000001'
);

select throws_ok(
  $$
    select public.phaseone_update_walk_in_volunteer(
      '79000000-0000-4000-8000-000000000002',
      '79000000-0000-4000-8000-000000000007',
      'Imported Volunteer Edited',
      'imported@example.test',
      null,
      '79000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001',
  'Only walk-in volunteer details can be edited here',
  'imported roster records cannot be edited through the walk-in correction function'
);

select * from finish();
rollback;
