# Current system architecture

**Last reviewed:** 16 September 2026

This document describes the system as it exists now and the boundaries that future work must preserve.

## 1. System context

KELUARGA is a Next.js application hosted on Vercel with Supabase providing authentication and PostgreSQL storage.

It currently combines three layers:

1. **Public volunteer companion** — opportunities, news, Event Guides and pathways.
2. **Staff event operations** — events, shifts, rosters, walk-ins, attendance, reviews, insights, feedback and reporting.
3. **Read-only official volunteer-data projection** — records imported from YM Hub/Salesforce for volunteer identity, registration, official attendance and verified hours.

KELUARGA is not intended to replace YM Hub as MENDAKI's authoritative volunteer system.

## 2. System ownership

| Data / capability | Authoritative owner | KELUARGA role |
|---|---|---|
| Volunteer master identity | YM Hub / Salesforce | Read-only projection and account linking |
| Volunteer status | YM Hub / Salesforce | Read-only projection |
| Registration / waitlist / cancellation | YM Hub / approved registration system | Read-only projection after sync |
| Official attendance | YM Hub | Read-only after reconciliation/import |
| Verified volunteer hours | YM Hub | Read-only |
| KELUARGA login/session | Supabase Auth / KELUARGA | App-owned |
| Opportunity presentation | KELUARGA CMS | App-owned, with external registration link |
| News | KELUARGA CMS | App-owned |
| Event Guides and operational instructions | KELUARGA | App-owned |
| Event roster and shifts | KELUARGA operations | Operational working data |
| Event-day check-in/check-out | KELUARGA operations | Operational evidence pending reconciliation |
| Walk-ins / absent / withdrawn | KELUARGA operations | Operational working data pending agreed downstream mapping |
| Volunteer reviews | KELUARGA | App-owned reviewed event-performance records |
| Volunteer insights | KELUARGA | App-owned reviewed observations |
| Event feedback | KELUARGA | App-owned |
| Points | KELUARGA | Derived only from eligible verified YM Hub records |
| Pathway map | KELUARGA | App-owned |
| Canonical central volunteer database in MakLom | MakLom | No automatic write-through from KELUARGA |

## 3. Main data domains

### `core`

Purpose:

- KELUARGA application accounts;
- internal volunteer records;
- account-to-volunteer linking;
- roles and authorization;
- protected account-scoped read functions.

Canonical account chain:

```text
Supabase Auth user UUID
        -> core.user_accounts.id
        -> core.volunteers.auth_user_id
        -> core.volunteers.ymhub_volunteer_id
```

`core.volunteers.id` is the internal KELUARGA volunteer identity. `ymhub_volunteer_id` links that record to the authoritative upstream volunteer record.

### `ymhub`

Purpose:

- read-only authoritative projections received from YM Hub/Salesforce;
- registration snapshots;
- attendance snapshots;
- volunteer sync/freshness state.

This layer is intentionally independent of the ingestion mechanism. Controlled CSV/batch imports can populate it now; a later server-only Salesforce adapter can populate the same model without redesigning volunteer-facing pages.

### `gamification`

Purpose:

- versioned point rules;
- append-only awards, adjustments and reversals;
- reconciliation from verified YM Hub attendance;
- auditable volunteer point balances.

Critical boundary:

```text
KELUARGA roster attendance
        X
        -> does not directly award points

verified ymhub.attendance_snapshots
        -> approved point rule
        -> append-only ledger
        -> volunteer points
```

### `public.phaseone_*`

Purpose:

- current deployed event-operation tables and functions;
- events/timeslots;
- roster;
- operational attendance;
- packages/Event Guides;
- volunteer insights;
- volunteer reviews;
- event feedback;
- event-day audit/history support.

The `phaseone` name is historical. These tables now back production-facing features and should not be casually renamed.

## 4. Identity models

KELUARGA deliberately has more than one identity concept.

### Organisational volunteer identity

Use:

```text
core.volunteers.id
        <-> ymhub_volunteer_id / Salesforce source ID
```

This identity is appropriate for official volunteer history and future cross-system reconciliation.

### Event operational identity

Event rosters use `attendance_person_key` to keep the same person linked across multiple shift rows, walk-in corrections, reviews and insights.

It solves event-day problems such as:

- a volunteer registered for AM and PM;
- a volunteer stays into another shift;
- staff correct a typo in a walk-in email;
- a review is attached to the person rather than an individual shift row.

It is **not** a canonical organisation-wide ID and must not be exported as one.

### Roster row identity

A roster row represents one event/timeslot assignment. One person can have several roster rows.

This distinction matters for reporting: roster rows/deployments are not the same metric as unique volunteers.

## 5. Authentication and authorization

### Volunteers

- Supabase Auth session.
- Passwordless email sign-in supported.
- Access to personal dashboard/points depends on authenticated account linking.
- KELUARGA authentication remains separate from YM Hub authentication during the current integration phase.

### Staff

Privileged UI/actions use role checks such as:

- event manager;
- content manager;
- pathway manager.

Privileged mutations are performed server-side. Browser clients must not receive the service-role key or Salesforce credentials.

Database RLS and grants provide a second enforcement layer for sensitive tables.

## 6. Major data flows

### Opportunity discovery and registration

```text
KELUARGA CMS / imported opportunity
        -> public opportunity page
        -> official external registration destination
        -> YM Hub / approved registration source
        -> later authoritative registration snapshot into KELUARGA
```

KELUARGA should not create an authoritative registration merely because a volunteer clicked Register.

### Event preparation

```text
KELUARGA event + package/Event Guide
        -> briefing / directions / programme information
        -> volunteer event preparation
```

Operational link access should follow the agreed event-guide access policy.

### Event-day attendance

```text
roster / walk-in
        -> staff or approved QR attendance action
        -> KELUARGA operational attendance
        -> monitor / exception handling / reconciliation
        -> attendance export / downstream processing
        -> YM Hub official attendance
        -> later verified snapshot returned to KELUARGA
```

The first KELUARGA attendance record and the later verified YM Hub record are intentionally different concepts.

### Continuous attendance

```text
person identity
        -> shift A roster row
        -> attendance session
        -> continuation into shift B
        -> final checkout
```

The effective attendance view resolves the event/shift state while retaining auditable underlying records.

### Volunteer insights and reviews

```text
event roster person
        -> staff insight / review
        -> KELUARGA reviewed event record
        -> event reporting / manual export
```

No automatic MakLom profile mutation occurs.

### Points

```text
official YM Hub attendance snapshot
        -> point reconciliation
        -> append-only ledger
        -> account-scoped points UI
```

## 7. Integration direction

### Immediate: controlled batch files

The current approved direction is batch exchange with YM Hub/Salesforce rather than a browser or direct production Salesforce connection.

The target inbound source sets documented in the repo are:

- Person Account;
- Volunteer Initiative;
- Job Position Shift;
- Job Position Assignment.

The intended batch process must include schema validation, identifiers, checksums, batch history, exception handling and data-freshness status.

### Future: server-only Salesforce/YM Hub adapter

If approved after security review, a future adapter should:

- run only server-side;
- use least-privilege read scopes initially;
- map upstream data into the existing `ymhub` projection model;
- preserve visible freshness/failure states;
- be idempotent;
- retain audit/reconciliation capability;
- never expose Salesforce credentials to the browser.

The ingestion mechanism can change without changing source-of-truth ownership.

### MakLom

Automatic KELUARGA -> MakLom synchronization is intentionally off.

If later implemented, use a reviewed inbox model:

```text
KELUARGA accepted insight
        -> MakLom insight inbox
        -> identity match / ambiguity handling
        -> human review
        -> optional canonical profile attribute
```

Do not write event observations directly into the canonical central volunteer profile without review and provenance.

## 8. Security model

Core principles:

- fail closed for authoritative data dependencies;
- RLS on sensitive data;
- server-only service-role use;
- explicit staff role checks;
- immutable/auditable attendance changes where required;
- append-only point history;
- input validation for roster/content/admin flows;
- CSV formula neutralisation on exports;
- safe redirect validation;
- CSP/security headers;
- no silent fabrication when source integrations fail.

See `docs/security/threat-model.md` for the detailed threat model.

## 9. Reporting semantics

Always specify the unit being counted:

- **unique volunteer** — one person, deduplicated by the appropriate identity;
- **deployment/roster record** — one person assigned to one shift;
- **event participation** — one person participating in one event;
- **shift attendance** — attendance state for a particular shift;
- **attendance session** — continuous check-in to final checkout, potentially spanning shifts;
- **verified hours** — authoritative hours returned from YM Hub.

These must not be used interchangeably.

## 10. Architecture invariants

Future changes should preserve these rules unless there is an explicit approved architecture decision:

1. YM Hub remains authoritative for volunteer identity, registration, official attendance and verified hours.
2. Operational KELUARGA attendance cannot directly become verified hours or points.
3. `attendance_person_key` is an event-operations identity, not a cross-system canonical identifier.
4. Browser code never receives service-role or Salesforce credentials.
5. Ambiguous identity matches fail to an exception workflow rather than auto-linking.
6. Points remain reproducible and auditable from verified source records.
7. Reviews and insights preserve source/context instead of silently overwriting canonical volunteer data.
8. Multi-shift reporting must distinguish unique people from shift/deployment rows.
