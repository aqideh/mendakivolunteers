begin;

select plan(9);

select has_table(
  'public',
  'phaseone_volunteer_reviews',
  'volunteer reviews table exists'
);

select ok(
  not has_table_privilege('anon', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'anonymous clients cannot read volunteer reviews'
);

select ok(
  not has_table_privilege('authenticated', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'authenticated clients cannot read volunteer reviews directly'
);

select ok(
  has_table_privilege('service_role', 'public.phaseone_volunteer_reviews', 'SELECT'),
  'service role can read volunteer reviews'
);

insert into auth.users (id, email)
values
  ('78000000-0000-4000-8000-000000000001', 'reviewer-one@example.test'),
  ('78000000-0000-4000-8000-000000000002', 'reviewer-two@example.test');

insert into public.phaseone_events (id, title, slug, created_by, updated_by)
values (
  '78000000-0000-4000-8000-000000000003',
  'Volunteer review test',
  'volunteer-review-test',
  '78000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (id, event_id, label, starts_at)
values (
  '78000000-0000-4000-8000-000000000004',
  '78000000-0000-4000-8000-000000000003',
  'Morning',
  '2026-09-15 01:00:00+00'
);

insert into public.phaseone_roster (
  id, event_id, timeslot_id, volunteer_name, email, uploaded_by
) values (
  '78000000-0000-4000-8000-000000000005',
  '78000000-0000-4000-8000-000000000003',
  '78000000-0000-4000-8000-000000000004',
  'Reviewed Volunteer',
  'reviewed-volunteer@example.test',
  '78000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_volunteer_reviews (
  event_id, roster_id, volunteer_person_key, rating,
  positive_behaviors, concern_behaviors, comments, follow_up_required, reviewed_by
) values
(
  '78000000-0000-4000-8000-000000000003',
  '78000000-0000-4000-8000-000000000005',
  'email:reviewed-volunteer@example.test',
  5,
  array['proactive','good_teamwork'],
  array[]::text[],
  'Strong event performance.',
  false,
  '78000000-0000-4000-8000-000000000001'
),
(
  '78000000-0000-4000-8000-000000000003',
  '78000000-0000-4000-8000-000000000005',
  'email:reviewed-volunteer@example.test',
  4,
  array['reliable'],
  array['late'],
  'Arrived late but performed reliably after arrival.',
  true,
  '78000000-0000-4000-8000-000000000002'
);

select is(
  (select count(*)::integer from public.phaseone_volunteer_reviews where event_id = '78000000-0000-4000-8000-000000000003'),
  2,
  'multiple staff can review the same volunteer at an event'
);

select is(
  (select avg(rating)::numeric(2,1) from public.phaseone_volunteer_reviews where event_id = '78000000-0000-4000-8000-000000000003'),
  4.5::numeric(2,1),
  'review ratings can be aggregated across staff'
);

select is(
  (select count(*)::integer from public.phaseone_volunteer_reviews where follow_up_required),
  1,
  'follow-up reviews are queryable'
);

select throws_ok(
  $$
    insert into public.phaseone_volunteer_reviews (
      event_id, roster_id, volunteer_person_key, rating, reviewed_by
    ) values (
      '78000000-0000-4000-8000-000000000003',
      '78000000-0000-4000-8000-000000000005',
      'email:reviewed-volunteer@example.test',
      3,
      '78000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505',
  null,
  'one staff member has at most one review per volunteer per event'
);

select throws_ok(
  $$
    insert into public.phaseone_volunteer_reviews (
      event_id, roster_id, volunteer_person_key, rating, reviewed_by
    ) values (
      '78000000-0000-4000-8000-000000000003',
      '78000000-0000-4000-8000-000000000005',
      'email:another-volunteer@example.test',
      6,
      '78000000-0000-4000-8000-000000000001'
    )
  $$,
  '23514',
  null,
  'ratings outside 1 to 5 are rejected'
);

select * from finish();
rollback;
