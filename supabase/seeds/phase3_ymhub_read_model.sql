-- Development and test data only. Never apply this seed file to production.
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
    '2026-07-15T01:00:00Z'
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
    'registered',
    'PROTO_REGISTERED',
    '2026-07-10T06:30:00Z',
    '2026-07-15T01:00:00Z'
  )
on conflict (volunteer_id, ymhub_registration_id) do update
set
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
    '2026-07-15T01:00:00Z'
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
    '2026-07-15T01:00:00Z'
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
    '2026-07-15T01:00:00Z'
  )
on conflict (volunteer_id, ymhub_attendance_id) do update
set
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
