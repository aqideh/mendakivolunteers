begin;

select plan(12);

select has_table(
  'public',
  'phaseone_volunteer_reviews',
  'volunteer reviews table exists'
);

select has_column(
  'public',
  'phaseone_volunteer_reviews',
  'rating',
  'volunteer reviews store a star rating'
);

select ok(
  (
    select relrowsecurity
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'phaseone_volunteer_reviews'
  ),
  'volunteer reviews have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'anonymous clients cannot read volunteer reviews'
);

select ok(
  not has_table_privilege('authenticated', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'authenticated clients cannot directly read volunteer reviews'
);

select ok(
  has_table_privilege('service_role', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'service role can read volunteer reviews'
);

insert into auth.users (id, email)
values ('75000000-0000-4000-8000-000000000001', 'review-staff@example.test');

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '75000000-0000-4000-8000-000000000002',
  'Volunteer review test',
  'volunteer-review-test',
  '75000000-0000-4000-8000-000000000001',
  '75000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '75000000-0000-4000-8000-000000000003',
  '75000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-09-15 01:00:00+00'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_key,
  volunteer_name,
  email,
  uploaded_by
)
values (
  '75000000-0000-4000-8000-000000000004',
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003',
  'REVIEW-001',
  'Reviewed Volunteer',
  'reviewed-volunteer@example.test',
  '75000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_volunteer_reviews (
  event_id,
  roster_id,
  volunteer_person_key,
  rating,
  positive_behaviors,
  concern_behaviors,
  comment,
  follow_up_required,
  reviewed_by
)
select
  event_id,
  id,
  attendance_person_key,
  4,
  array['proactive', 'good_teamwork'],
  array['late'],
  'Strong contribution after arriving late.',
  true,
  '75000000-0000-4000-8000-000000000001'
from public.phaseone_roster
where id = '75000000-0000-4000-8000-000000000004';

select is(
  (
    select rating::integer
    from public.phaseone_volunteer_reviews
    where roster_id = '75000000-0000-4000-8000-000000000004'
  ),
  4,
  'review rating is stored'
);

select is(
  (
    select positive_behaviors
    from public.phaseone_volunteer_reviews
    where roster_id = '75000000-0000-4000-8000-000000000004'
  ),
  array['proactive', 'good_teamwork']::text[],
  'structured positive behaviours are stored'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_name,
  entry_method,
  uploaded_by
)
values (
  '75000000-0000-4000-8000-000000000005',
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000003',
  'Walk In Typo',
  'walk_in',
  '75000000-0000-4000-8000-000000000001'
);

create temporary table walk_in_identity_before as
select attendance_person_key
from public.phaseone_roster
where id = '75000000-0000-4000-8000-000000000005';

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '75000000-0000-4000-8000-000000000006',
  '75000000-0000-4000-8000-000000000002',
  'Afternoon',
  '2026-09-15 05:00:00+00'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_name,
  entry_method,
  attendance_person_key,
  uploaded_by
)
select
  '75000000-0000-4000-8000-000000000007',
  '75000000-0000-4000-8000-000000000002',
  '75000000-0000-4000-8000-000000000006',
  'Walk In Typo',
  'walk_in',
  attendance_person_key,
  '75000000-0000-4000-8000-000000000001'
from walk_in_identity_before;

update public.phaseone_roster
set volunteer_name = 'Walk In Corrected',
    email = 'walk-in-corrected@example.test',
    mobile = '91234567'
where event_id = '75000000-0000-4000-8000-000000000002'
  and attendance_person_key = (
    select attendance_person_key
    from walk_in_identity_before
  )
  and entry_method = 'walk_in';

select is(
  (
    select attendance_person_key
    from public.phaseone_roster
    where id = '75000000-0000-4000-8000-000000000005'
  ),
  (
    select attendance_person_key
    from walk_in_identity_before
  ),
  'correcting walk-in details preserves the event volunteer identity key'
);

select is(
  (
    select volunteer_name
    from public.phaseone_roster
    where id = '75000000-0000-4000-8000-000000000005'
  ),
  'Walk In Corrected',
  'walk-in name corrections are stored'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster
    where event_id = '75000000-0000-4000-8000-000000000002'
      and attendance_person_key = (
        select attendance_person_key
        from walk_in_identity_before
      )
      and volunteer_name = 'Walk In Corrected'
      and email = 'walk-in-corrected@example.test'
      and mobile = '91234567'
  ),
  2,
  'walk-in corrections apply to every shift row for the same event volunteer'
);

select is(
  (
    select count(*)::integer
    from public.phaseone_roster
    where event_id = '75000000-0000-4000-8000-000000000002'
      and attendance_person_key = (
        select attendance_person_key
        from walk_in_identity_before
      )
  ),
  2,
  'cross-shift walk-in corrections keep both roster rows on one volunteer identity'
);

select * from finish();
rollback;
