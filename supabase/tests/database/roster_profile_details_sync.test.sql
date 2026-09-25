begin;

select plan(11);

select ok(
  has_table_privilege(
    'service_role',
    'public.volunteer_private_details',
    'SELECT,INSERT,UPDATE'
  ),
  'service role can maintain canonical volunteer private details'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_admin_update_roster_profile_details(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'service role can update roster-linked volunteer profile details'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_admin_update_roster_profile_details(uuid,uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'browser clients cannot call roster profile updates directly'
);

insert into auth.users(id, email, email_confirmed_at)
values (
  '99300000-0000-4000-8000-000000000001',
  'roster-profile-admin@example.test',
  now()
);

update core.user_accounts
set status = 'active'
where id = '99300000-0000-4000-8000-000000000001';

insert into core.user_roles(user_id, role, granted_by, reason)
values (
  '99300000-0000-4000-8000-000000000001',
  'attendance_manager',
  '99300000-0000-4000-8000-000000000001',
  'Roster profile sync regression test'
);

insert into public.phaseone_events(
  id,
  title,
  slug,
  venue,
  operations_scope,
  created_by,
  updated_by
)
values (
  '99300000-0000-4000-8000-000000000010',
  'Roster profile sync test event',
  'roster-profile-sync-test-event',
  'Test venue',
  'canonical',
  '99300000-0000-4000-8000-000000000001',
  '99300000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  status,
  sort_order
)
values
(
  '99300000-0000-4000-8000-000000000011',
  '99300000-0000-4000-8000-000000000010',
  'First shift',
  '2026-10-16 09:00:00+08',
  '2026-10-16 12:00:00+08',
  'scheduled',
  0
),
(
  '99300000-0000-4000-8000-000000000012',
  '99300000-0000-4000-8000-000000000010',
  'Second shift',
  '2026-10-17 09:00:00+08',
  '2026-10-17 12:00:00+08',
  'scheduled',
  1
);

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_admin_create_or_link_volunteer_to_roster(
      '99300000-0000-4000-8000-000000000010',
      array['99300000-0000-4000-8000-000000000011']::uuid[],
      'Returning Roster Volunteer',
      'returning-roster-profile@example.test',
      '85678901',
      34::smallint,
      null,
      null,
      '99300000-0000-4000-8000-000000000001'
    )
  $$,
  'returning volunteer can be placed on the roster without profile details'
);

select lives_ok(
  $$
    select public.phaseone_admin_update_roster_profile_details(
      '99300000-0000-4000-8000-000000000010',
      (
        select id
        from core.volunteers
        where primary_email_normalized = 'returning-roster-profile@example.test'
      ),
      '3XL',
      'Vegetarian',
      '99300000-0000-4000-8000-000000000001'
    )
  $$,
  'staff can backfill shirt and dietary data from the roster'
);

reset role;

select is(
  (
    select tshirt_size
    from public.volunteer_private_details details
    join core.volunteers volunteer on volunteer.id = details.volunteer_id
    where volunteer.primary_email_normalized = 'returning-roster-profile@example.test'
  ),
  '3XL',
  'T-shirt size is saved to the canonical volunteer profile'
);

select is(
  (
    select dietary_requirements
    from public.volunteer_private_details details
    join core.volunteers volunteer on volunteer.id = details.volunteer_id
    where volunteer.primary_email_normalized = 'returning-roster-profile@example.test'
  ),
  'Vegetarian',
  'dietary requirements are saved to the canonical volunteer profile'
);

select ok(
  exists (
    select 1
    from public.phaseone_roster roster
    join core.volunteers volunteer on volunteer.id = roster.volunteer_id
    where roster.event_id = '99300000-0000-4000-8000-000000000010'
      and roster.timeslot_id = '99300000-0000-4000-8000-000000000011'
      and volunteer.primary_email_normalized = 'returning-roster-profile@example.test'
      and roster.tshirt_size = '3XL'
      and roster.dietary_requirements = 'Vegetarian'
  ),
  'current event roster refreshes after the profile backfill'
);

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_add_database_volunteers_to_roster(
      '99300000-0000-4000-8000-000000000010',
      array['99300000-0000-4000-8000-000000000012']::uuid[],
      array[
        (
          select id
          from core.volunteers
          where primary_email_normalized = 'returning-roster-profile@example.test'
        )
      ]::uuid[],
      '99300000-0000-4000-8000-000000000001'
    )
  $$,
  'returning volunteer can be added to another roster shift'
);

reset role;

select ok(
  exists (
    select 1
    from public.phaseone_roster roster
    join core.volunteers volunteer on volunteer.id = roster.volunteer_id
    where roster.event_id = '99300000-0000-4000-8000-000000000010'
      and roster.timeslot_id = '99300000-0000-4000-8000-000000000012'
      and volunteer.primary_email_normalized = 'returning-roster-profile@example.test'
      and roster.tshirt_size = '3XL'
      and roster.dietary_requirements = 'Vegetarian'
  ),
  'future roster assignments inherit canonical shirt and dietary data'
);

select is(
  (
    select count(*)::integer
    from public.volunteer_private_details details
    join core.volunteers volunteer on volunteer.id = details.volunteer_id
    where volunteer.primary_email_normalized = 'returning-roster-profile@example.test'
  ),
  1,
  'volunteer has one canonical private profile record'
);

select * from finish();

rollback;
