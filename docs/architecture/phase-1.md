# Phase 1 architecture

## Objective

Phase 1 establishes a secure web platform that can be extended without coupling application features to the eventual Salesforce object and field API names.

## Runtime components

```text
Browser
  |
  | Supabase Auth cookie and publishable key
  v
Next.js web application
  |
  +-- Server Components and Server Actions
  +-- Supabase SSR session refresh through proxy.ts
  +-- No YM Hub runtime adapter until the reviewed Salesforce integration exists
  |
  v
Supabase
  |
  +-- core.user_accounts
  +-- core.volunteers
  +-- core.user_roles
  +-- core.account_link_cases
  +-- audit.events

Future production path:
Next.js server process -> SalesforceYmHubGateway -> YM Hub
```

The browser never receives a Salesforce credential or a Supabase secret key.

## Identity separation

Three identifiers serve different purposes:

| Identifier | Owner | Purpose |
|---|---|---|
| `auth.users.id` | Supabase Auth | Authenticated web identity |
| `core.volunteers.id` | KELUARGA | Stable volunteer identity for recruitment, registration and app-owned data |
| `core.volunteers.ymhub_volunteer_id` | YM Hub | Optional backend reconciliation identifier once a YM Hub record exists |

An authenticated KELUARGA volunteer can exist before any YM Hub record exists. The target schema therefore makes the YM Hub identifier optional and attaches it later through an audited backend reconciliation process. Volunteers must not self-claim a YM Hub identifier.

## Authorization

Phase 1 uses database-backed roles and Row Level Security. Every new account receives the `volunteer` role. Elevated roles are written only by trusted server or administrative processes.

Volunteers can read:

- Their own application account.
- Their own linked volunteer projection.
- Their own role rows.
- Their own account-link case.

Support officers and auditors receive narrowly defined read access. No browser role can insert or update volunteer identities, roles, or YM Hub projections.

## YM Hub adapter boundary

A future Salesforce/YM Hub handoff adapter may expose canonical reconciliation fields:

```ts
externalVolunteerId
status
sourceUpdatedAt
```

No development gateway is present in the application runtime. Local Supabase seed records are explicit database fixtures and are never substituted for an unavailable integration. KELUARGA recruitment, registration and event operations must not be blocked by the absence of a direct Salesforce adapter; the backend handoff can initially be controlled batch processing.

## Audit model

`audit.events` is an append-only event stream with no browser schema access. Database triggers record:

- Account creation and status changes.
- Volunteer projection creation.
- Identity link changes.
- YM Hub status changes.
- Role grants and revocations.
- Account-link case creation and status changes.

Audit metadata is deliberately limited rather than storing complete row snapshots.

## Delivery constraints retained for later phases

- KELUARGA is the live source for volunteer-facing recruitment, registration, waitlist/cancellation and event operations.
- A volunteer may be created in KELUARGA before a YM Hub record exists.
- Event attendance remains operational evidence until the approved backend handoff/verification is completed.
- Verified hours and any rewards policy that explicitly depends on verified hours remain dependent on YM Hub verification.
- Opportunity listings and news remain app-owned content.
