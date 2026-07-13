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
