-- Development and test data only. Never apply this seed file to production.
insert into core.volunteers (
  id,
  ymhub_volunteer_id,
  ymhub_status,
  source_updated_at,
  last_synced_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'PROTO-VOL-000001',
    'PROTO_VERIFIED',
    '2026-07-01T08:00:00Z',
    '2026-07-10T08:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'PROTO-VOL-000002',
    'PROTO_PENDING',
    '2026-07-05T02:30:00Z',
    '2026-07-10T08:00:00Z'
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    'PROTO-VOL-000003',
    'PROTO_INACTIVE',
    '2026-07-08T11:15:00Z',
    '2026-07-10T08:00:00Z'
  )
on conflict (ymhub_volunteer_id) do update
set
  ymhub_status = excluded.ymhub_status,
  source_updated_at = excluded.source_updated_at,
  last_synced_at = excluded.last_synced_at;

insert into ymhub.volunteer_sync_status (
  volunteer_id,
  registrations_synced_at,
  attendance_synced_at,
  last_attempted_at,
  last_successful_at,
  last_failed_at
)
values
  (
    '10000000-0000-4000-8000-000000000001',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    null
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    '2026-07-15T03:30:00Z',
    null
  )
on conflict (volunteer_id) do update
set
  registrations_synced_at = excluded.registrations_synced_at,
  attendance_synced_at = excluded.attendance_synced_at,
  last_attempted_at = excluded.last_attempted_at,
  last_successful_at = excluded.last_successful_at,
  last_failed_at = excluded.last_failed_at;

insert into ymhub.registration_snapshots (
  id,
  volunteer_id,
  ymhub_registration_id,
  ymhub_activity_id,
  activity_title,
  activity_category,
  activity_starts_at,
  activity_ends_at,
  registered_at,
  state,
  source_status,
  source_updated_at,
  last_synced_at
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'PROTO-REG-000001',
    'PROTO-ACT-000001',
    'Community Learning Support',
    'Education',
    '2026-07-25T01:00:00Z',
    '2026-07-25T05:00:00Z',
    '2026-07-08T04:00:00Z',
    'registered',
    'PROTO_REGISTERED',
    '2026-07-08T04:00:00Z',
    '2026-07-15T03:30:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'PROTO-REG-000002',
    'PROTO-ACT-000002',
    'National Day Community Event',
    'Community',
    '2026-08-09T02:00:00Z',
    '2026-08-09T08:00:00Z',
    '2026-07-10T06:30:00Z',
    'waitlisted',
    'PROTO_WAITLISTED',
    '2026-07-10T06:30:00Z',
    '2026-07-15T03:30:00Z'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'PROTO-REG-000003',
    'PROTO-ACT-000006',
    'Volunteer Befriending Session',
    'Community',
    '2026-08-15T01:00:00Z',
    '2026-08-15T04:00:00Z',
    '2026-07-11T02:00:00Z',
    'registered',
    'PROTO_REGISTERED',
    '2026-07-11T02:00:00Z',
    '2026-07-15T03:30:00Z'
  )
on conflict (ymhub_registration_id) do update
set
  volunteer_id = excluded.volunteer_id,
  ymhub_activity_id = excluded.ymhub_activity_id,
  activity_title = excluded.activity_title,
  activity_category = excluded.activity_category,
  activity_starts_at = excluded.activity_starts_at,
  activity_ends_at = excluded.activity_ends_at,
  registered_at = excluded.registered_at,
  state = excluded.state,
  source_status = excluded.source_status,
  source_updated_at = excluded.source_updated_at,
  last_synced_at = excluded.last_synced_at;

insert into ymhub.attendance_snapshots (
  id,
  volunteer_id,
  ymhub_attendance_id,
  ymhub_activity_id,
  activity_title,
  activity_category,
  activity_starts_at,
  activity_ends_at,
  state,
  source_status,
  verified_hours,
  verified_at,
  source_updated_at,
  last_synced_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'PROTO-ATT-000001',
    'PROTO-ACT-000003',
    'Neighbourhood Learning Support',
    'Education',
    '2026-06-10T01:00:00Z',
    '2026-06-10T04:00:00Z',
    'verified',
    'PROTO_VERIFIED',
    3.00,
    '2026-06-12T03:00:00Z',
    '2026-06-12T03:00:00Z',
    '2026-07-15T03:30:00Z'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'PROTO-ATT-000002',
    'PROTO-ACT-000004',
    'Community Family Day',
    'Community',
    '2026-06-28T00:30:00Z',
    '2026-06-28T05:00:00Z',
    'verified',
    'PROTO_VERIFIED',
    4.50,
    '2026-07-01T02:00:00Z',
    '2026-07-01T02:00:00Z',
    '2026-07-15T03:30:00Z'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'PROTO-ATT-000003',
    'PROTO-ACT-000005',
    'Volunteer Orientation',
    'Onboarding',
    '2026-07-12T02:00:00Z',
    '2026-07-12T04:00:00Z',
    'pending',
    'PROTO_PENDING_REVIEW',
    null,
    null,
    '2026-07-12T05:00:00Z',
    '2026-07-15T03:30:00Z'
  ),
  (
    '50000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000002',
    'PROTO-ATT-000004',
    'PROTO-ACT-000007',
    'Food Distribution Support',
    'Community',
    '2026-06-20T01:00:00Z',
    '2026-06-20T04:00:00Z',
    'verified',
    'PROTO_VERIFIED',
    3.00,
    '2026-06-22T01:00:00Z',
    '2026-06-22T01:00:00Z',
    '2026-07-15T03:30:00Z'
  )
on conflict (ymhub_attendance_id) do update
set
  volunteer_id = excluded.volunteer_id,
  ymhub_activity_id = excluded.ymhub_activity_id,
  activity_title = excluded.activity_title,
  activity_category = excluded.activity_category,
  activity_starts_at = excluded.activity_starts_at,
  activity_ends_at = excluded.activity_ends_at,
  state = excluded.state,
  source_status = excluded.source_status,
  verified_hours = excluded.verified_hours,
  verified_at = excluded.verified_at,
  source_updated_at = excluded.source_updated_at,
  last_synced_at = excluded.last_synced_at;

insert into content.opportunities (
  id,
  slug,
  title,
  summary,
  body,
  category,
  location_name,
  is_remote,
  starts_at,
  ends_at,
  registration_deadline,
  registration_url,
  ymhub_activity_id,
  featured,
  status,
  publish_at,
  published_at
)
values
  (
    '20000000-0000-4000-8000-000000000001',
    'community-learning-support',
    'Community Learning Support',
    'Support learners and facilitators during a community learning session.',
    'Volunteers will help with participant wayfinding, room preparation, learning materials, and general session support. Registration and confirmation remain managed in YM Hub.',
    'Education',
    'MENDAKI premises',
    false,
    '2026-07-25T01:00:00Z',
    '2026-07-25T05:00:00Z',
    '2026-07-22T15:59:00Z',
    'https://example.invalid/ymhub/opportunities/PROTO-ACT-000001',
    'PROTO-ACT-000001',
    true,
    'published',
    '2026-07-10T00:00:00Z',
    '2026-07-10T00:00:00Z'
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'national-day-community-event',
    'National Day Community Event',
    'Assist with guest support and activity stations at a community event.',
    'Volunteers will be assigned to guest support, activity stations, and event logistics. Selecting Register opens the configured local YM Hub test destination.',
    'Community',
    'Singapore',
    false,
    '2026-08-09T02:00:00Z',
    '2026-08-09T08:00:00Z',
    '2026-08-05T15:59:00Z',
    'https://example.invalid/ymhub/opportunities/PROTO-ACT-000002',
    'PROTO-ACT-000002',
    false,
    'published',
    '2026-07-10T00:00:00Z',
    '2026-07-10T00:00:00Z'
  )
on conflict (slug) do update
set
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  category = excluded.category,
  location_name = excluded.location_name,
  is_remote = excluded.is_remote,
  starts_at = excluded.starts_at,
  ends_at = excluded.ends_at,
  registration_deadline = excluded.registration_deadline,
  registration_url = excluded.registration_url,
  ymhub_activity_id = excluded.ymhub_activity_id,
  featured = excluded.featured,
  status = excluded.status,
  publish_at = excluded.publish_at,
  published_at = excluded.published_at;

insert into content.news_posts (
  id,
  slug,
  title,
  summary,
  body,
  featured,
  status,
  publish_at,
  published_at
)
values (
  '30000000-0000-4000-8000-000000000001',
  'welcome-to-the-volunteer-portal',
  'Welcome to the volunteer portal',
  'Local development includes app-managed opportunities and volunteer news.',
  'This web application supplements YM Hub. Opportunity registration and verified volunteer records remain managed in YM Hub, while this portal provides a focused volunteer experience.',
  true,
  'published',
  '2026-07-10T00:00:00Z',
  '2026-07-10T00:00:00Z'
)
on conflict (slug) do update
set
  title = excluded.title,
  summary = excluded.summary,
  body = excluded.body,
  featured = excluded.featured,
  status = excluded.status,
  publish_at = excluded.publish_at,
  published_at = excluded.published_at;
