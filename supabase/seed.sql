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
    'Volunteers will be assigned to guest support, activity stations, and event logistics. Selecting Register opens the prototype YM Hub registration destination.',
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
  'The prototype now includes app-managed opportunities and volunteer news.',
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
