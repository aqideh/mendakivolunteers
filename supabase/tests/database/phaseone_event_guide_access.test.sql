begin;

select plan(7);

select has_column(
  'public',
  'phaseone_events',
  'ymhub_activity_id',
  'event guides can store an authoritative YM Hub activity identifier'
);

select has_column(
  'public',
  'phaseone_roster',
  'email_normalized',
  'roster rows expose a generated normalized email for transitional access matching'
);

select ok(
  has_column_privilege(
    'anon',
    'public.phaseone_events',
    'title',
    'SELECT'
  )
  and not has_column_privilege(
    'anon',
    'public.phaseone_events',
    'briefing_url',
    'SELECT'
  ),
  'anonymous clients can read opportunity-safe fields but not Event Guide operational fields'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.phaseone_events',
    'title',
    'SELECT'
  )
  and not has_column_privilege(
    'authenticated',
    'public.phaseone_events',
    'briefing_url',
    'SELECT'
  ),
  'authenticated clients cannot bypass Event Guide authorization through public programme access'
);

select ok(
  not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phaseone_events'
      and policyname = 'Public can read published event operations'
  ),
  'the historical public Event Guide policy is removed'
);

select has_index(
  'public',
  'phaseone_roster',
  'phaseone_roster_email_event_idx',
  'normalized roster email matching is indexed'
);

insert into auth.users (id, email)
values ('74000000-0000-4000-8000-000000000001', 'event-guide-staff@example.test');

insert into public.phaseone_events (
  id,
  title,
  slug,
  created_by,
  updated_by
)
values (
  '74000000-0000-4000-8000-000000000002',
  'Event Guide access test',
  'event-guide-access-test',
  '74000000-0000-4000-8000-000000000001',
  '74000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots (
  id,
  event_id,
  label,
  starts_at
)
values (
  '74000000-0000-4000-8000-000000000003',
  '74000000-0000-4000-8000-000000000002',
  'Morning',
  '2026-09-12 01:00:00+00'
);

insert into public.phaseone_roster (
  id,
  event_id,
  timeslot_id,
  volunteer_name,
  email,
  uploaded_by
)
values (
  '74000000-0000-4000-8000-000000000004',
  '74000000-0000-4000-8000-000000000002',
  '74000000-0000-4000-8000-000000000003',
  'Registered Volunteer',
  '  Registered.Volunteer@Example.Test  ',
  '74000000-0000-4000-8000-000000000001'
);

select is(
  (
    select email_normalized
    from public.phaseone_roster
    where id = '74000000-0000-4000-8000-000000000004'
  ),
  'registered.volunteer@example.test',
  'roster email matching is case-insensitive and whitespace-normalized'
);

select * from finish();
rollback;
