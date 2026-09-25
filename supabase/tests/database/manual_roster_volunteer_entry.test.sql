begin;

select plan(10);

select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_admin_create_or_link_volunteer_to_roster(uuid,uuid[],text,text,text,smallint,text,text,uuid)',
    'EXECUTE'
  ),
  'service role can create or link planned roster volunteers'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_admin_create_or_link_volunteer_to_roster(uuid,uuid[],text,text,text,smallint,text,text,uuid)',
    'EXECUTE'
  ),
  'browser clients cannot call planned roster volunteer creation directly'
);

insert into auth.users(id, email, email_confirmed_at)
values ('99100000-0000-4000-8000-000000000001', 'manual-roster-admin@example.test', now());

update core.user_accounts
set status = 'active'
where id = '99100000-0000-4000-8000-000000000001';

insert into core.user_roles(user_id, role, granted_by, reason)
values (
  '99100000-0000-4000-8000-000000000001',
  'attendance_manager',
  '99100000-0000-4000-8000-000000000001',
  'Manual roster volunteer regression test'
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
  '99100000-0000-4000-8000-000000000010',
  'Manual roster volunteer test event',
  'manual-roster-volunteer-test-event',
  'Test venue',
  'canonical',
  '99100000-0000-4000-8000-000000000001',
  '99100000-0000-4000-8000-000000000001'
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
values (
  '99100000-0000-4000-8000-000000000011',
  '99100000-0000-4000-8000-000000000010',
  'Main shift',
  '2026-10-15 09:00:00+08',
  '2026-10-15 12:00:00+08',
  'scheduled',
  0
);

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_admin_create_or_link_volunteer_to_roster(
      '99100000-0000-4000-8000-000000000010',
      array['99100000-0000-4000-8000-000000000011']::uuid[],
      'Planned New Volunteer',
      'planned-new-volunteer@example.test',
      '81234567',
      27::smallint,
      'L',
      'Vegetarian',
      '99100000-0000-4000-8000-000000000001'
    )
  $$,
  'staff can create a canonical volunteer during planned roster setup'
);

reset role;

select matches(
  (
    select volunteer_code
    from core.volunteers
    where primary_email_normalized = 'planned-new-volunteer@example.test'
  ),
  '^KEL[0-9]{5}$',
  'new planned volunteer receives a KELUARGA Volunteer ID'
);

select ok(
  exists (
    select 1
    from public.phaseone_roster roster
    join core.volunteers volunteer on volunteer.id = roster.volunteer_id
    where roster.event_id = '99100000-0000-4000-8000-000000000010'
      and roster.timeslot_id = '99100000-0000-4000-8000-000000000011'
      and volunteer.primary_email_normalized = 'planned-new-volunteer@example.test'
      and roster.entry_method = 'staff_database'
      and roster.source_assignment_status = 'staff_created_volunteer'
  ),
  'new canonical volunteer is linked to the selected roster shift'
);

select ok(
  exists (
    select 1
    from public.volunteer_private_details details
    join core.volunteers volunteer on volunteer.id = details.volunteer_id
    where volunteer.primary_email_normalized = 'planned-new-volunteer@example.test'
      and details.tshirt_size = 'L'
      and details.dietary_requirements = 'Vegetarian'
  ),
  'optional roster setup details are retained on the volunteer profile'
);

select ok(
  (
    select account_access_eligible
    from core.volunteers
    where primary_email_normalized = 'planned-new-volunteer@example.test'
  ),
  'email-created volunteer can later link to a verified KELUARGA account'
);

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_admin_create_or_link_volunteer_to_roster(
      '99100000-0000-4000-8000-000000000010',
      array['99100000-0000-4000-8000-000000000011']::uuid[],
      'Planned New Volunteer',
      'planned-new-volunteer@example.test',
      '81234567',
      27::smallint,
      'L',
      'Vegetarian',
      '99100000-0000-4000-8000-000000000001'
    )
  $$,
  're-entering the same identifiers reuses the canonical volunteer'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.volunteers
    where primary_email_normalized = 'planned-new-volunteer@example.test'
  ),
  1,
  'matching manual entry does not create a duplicate volunteer identity'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster roster
    join core.volunteers volunteer on volunteer.id = roster.volunteer_id
    where roster.event_id = '99100000-0000-4000-8000-000000000010'
      and roster.timeslot_id = '99100000-0000-4000-8000-000000000011'
      and volunteer.primary_email_normalized = 'planned-new-volunteer@example.test'
  ),
  1,
  'matching manual entry does not duplicate the roster assignment'
);

select * from finish();

rollback;
