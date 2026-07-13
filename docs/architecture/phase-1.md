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
  +-- Canonical YM Hub gateway interface
  |
  v
Supabase
  |
  +-- core.user_accounts
  +-- core.volunteers
  +-- core.user_roles
  +-- core.account_link_cases
  +-- audit.events

Development only:
Next.js -> MockYmHubGateway -> PROTO-VOL-* records

Future production path:
Next.js server process -> SalesforceYmHubGateway -> YM Hub
```

The browser never receives a Salesforce credential or a Supabase secret key.

## Identity separation

Three identifiers serve different purposes:

| Identifier | Owner | Purpose |
|---|---|---|
| `auth.users.id` | Supabase Auth | Authenticated web identity |
| `core.volunteers.id` | App | Internal foreign key for app-owned data |
| `core.volunteers.ymhub_volunteer_id` | YM Hub | Authoritative external volunteer identifier |

An authenticated user is not automatically allowed to claim a YM Hub volunteer ID. The nullable `auth_user_id` link is established through a controlled server-side or staff-assisted process. Ambiguous matches can be recorded in `core.account_link_cases`.

## Authorization

Phase 1 uses database-backed roles and Row Level Security. Every new account receives the `volunteer` role. Elevated roles are written only by trusted server or administrative processes.

Volunteers can read:

- Their own application account.
- Their own linked volunteer projection.
- Their own role rows.
- Their own account-link case.

Support officers and auditors receive narrowly defined read access. No browser role can insert or update volunteer identities, roles, or YM Hub projections.

## YM Hub adapter boundary

Application features consume canonical fields:

```ts
externalVolunteerId
status
sourceUpdatedAt
```

The current `MockYmHubGateway` supplies development data. Salesforce API names are isolated in environment-backed adapter configuration. Production rejects mock mode and values containing `PROTO`, `PLACEHOLDER`, or bracketed placeholder tokens.

The Salesforce gateway is intentionally not implemented in Phase 1. Selecting Salesforce mode currently fails closed.

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

- The web app is not the source of truth for registration.
- App attendance records are capture and staff handoff records only.
- Official attendance, verified hours, and attendance-based rewards depend on downstream YM Hub records.
- Opportunity listings and news remain app-owned content.
