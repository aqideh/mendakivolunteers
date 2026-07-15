# Phase 3: read-only YM Hub activity model

## Purpose

Phase 3 introduces the application-side read path for authoritative YM Hub
registration and attendance data. It does not enable Salesforce connectivity by
itself and does not make the portal authoritative for either record type.

## Data flow

```text
Future verified sync worker
  |
  | server-only Salesforce credentials
  v
service_role writes
  |
  +-- ymhub.volunteer_sync_status
  +-- ymhub.registration_snapshots
  +-- ymhub.attendance_snapshots
  |
  | authenticated SELECT with forced RLS
  v
Volunteer dashboard
```

The browser cannot insert, update, or delete any YM Hub projection. Only the
server-side synchronisation identity may write through `service_role`.

## Explicit availability states

`ymhub.volunteer_sync_status` prevents the interface from interpreting an empty
table as a successful empty response. The dashboard treats these conditions
separately:

- No sync row: the first authoritative sync has not completed; records are
  unavailable.
- Latest failure newer than latest success: the dashboard reports the failed
  sync and labels any displayed snapshots as coming from the last success.
- Successful domain timestamp with zero rows: YM Hub returned an authoritative
  empty result for that domain.

No application runtime mock, generated record, or silent empty-array substitute
is used for an integration outage.

## Projection integrity

- Source registration and attendance identifiers are globally unique.
- Canonical status enums contain only reviewed application states; there is no
  `unknown` state.
- A verified attendance record must include non-negative verified hours and a
  verification timestamp.
- Non-verified attendance records cannot carry verified hours or timestamps.
- Activity end times cannot precede start times.

Unexpected source statuses must stop ingestion and be reported operationally.
They must not be coerced into a catch-all state.

## Access control

All three tables have forced Row Level Security. An active linked volunteer can
read only rows tied to their internal volunteer UUID. Active support officers,
auditors, and administrators can read projection rows for support work. Anonymous
users receive no schema or table access, and authenticated users receive no write
grants.

The exposed `ymhub` schema is listed explicitly in local Supabase configuration.
Its table grants and RLS policies are both tested because Data API exposure and
row authorization are separate controls.

## Local UI data

`supabase/seed.sql` contains explicit development/test fixtures. They are loaded
only by a local database reset and are never selected as a runtime alternative to
Salesforce. Production remains blocked by the release readiness check until the
real adapter is implemented and verified against a non-production YM Hub tenant.

## Remaining integration work

1. Obtain the object, field, relationship, status, deletion, and volume contract
   listed in `docs/ymhub-field-request.md`.
2. Implement a server-only read adapter with explicit API version and mappings.
3. Implement idempotent reconciliation and operational sync-run logging.
4. Test mapping, pagination, rate limiting, expired credentials, partial failure,
   deletion, merge, and stale-data behaviour against a non-production tenant.
5. Complete security review before removing the production release block.
