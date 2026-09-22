# Current system architecture

**Last reviewed:** 22 September 2026

This document describes the system as it exists now and the boundaries that future work must preserve.

## 1. System context

KELUARGA is a Next.js application hosted on Vercel with Supabase providing authentication and PostgreSQL storage.

It combines four layers:

1. **Volunteer recruitment and discovery** — pathways, recruitment intake, opportunities and news.
2. **KELUARGA registration** — event/opportunity registration, waitlist, cancellation and shift selection.
3. **Staff event operations** — events, shifts, rosters, walk-ins, attendance, reviews, insights, feedback and reporting.
4. **Backend record reconciliation** — YM Hub/Salesforce projections for organisational record matching, verified attendance and verified hours.

KELUARGA is the volunteer-facing system of engagement and live operational system for recruitment, registration and event operations. YM Hub remains MENDAKI's authoritative backend organisational source of record.

## 2. System ownership

| Data / capability | Authoritative owner | KELUARGA role |
|---|---|---|
| KELUARGA volunteer identity | KELUARGA | App-owned stable UUID; may exist before YM Hub linkage |
| YM Hub volunteer identifier / backend master record | YM Hub / Salesforce | Optional reconciliation link once available |
| Recruitment journey and application status | KELUARGA | App-owned live workflow |
| Registration / waitlist / cancellation | KELUARGA | App-owned live workflow; handed off/reconciled to YM Hub backend |
| Official verified attendance / hours | YM Hub | Returned/read after backend verification |
| KELUARGA login/session | Supabase Auth / KELUARGA | App-owned |
| Opportunity presentation | KELUARGA CMS | App-owned; target state uses in-app registration |
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
        -> core.volunteers.id
        -> optional core.volunteers.ymhub_volunteer_id
```

`core.volunteers.id` is the stable KELUARGA volunteer identity and must be usable before any YM Hub record exists. `ymhub_volunteer_id` becomes a reconciliation key attached later when available.

### `ymhub`

Purpose:

- read-only backend projections received from YM Hub/Salesforce;
- legacy/backend registration snapshots used for reconciliation where required;
- verified attendance snapshots;
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

This KELUARGA identity is the primary app key for recruitment, registration and operations. The YM Hub ID is an optional cross-system reconciliation identifier rather than a prerequisite for creating a volunteer.

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
- Access to personal recruitment, registration and event information depends on the KELUARGA account/volunteer link.
- Volunteers should not need a YM Hub sign-in for ordinary recruitment or registration.

### Staff

Privileged UI/actions use role checks such as:

- event manager;
- content manager;
- pathway manager.

Privileged mutations are performed server-side. Browser clients must not receive the service-role key or Salesforce credentials.

Database RLS and grants provide a second enforcement layer for sensitive tables.

## 6. Major data flows

### Recruitment, opportunity discovery and registration

```text
KELUARGA recruitment / account
        -> public opportunity page
        -> KELUARGA registration / waitlist / shift selection
        -> confirmed registration
        -> KELUARGA event roster
        -> event operations
```

KELUARGA registration state is immediate operational truth for the volunteer-facing workflow. A separate backend handoff then reconciles the relevant records into YM Hub.

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
        -> event report / downstream processing
        -> MakLom manual report upload where applicable
        -> YM Hub backend attendance handoff / verification
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

### Immediate: KELUARGA-owned workflow plus controlled backend handoff

Volunteer-facing recruitment and registration no longer depend on inbound YM Hub registration data. KELUARGA must create and retain its own stable volunteer, recruitment, registration, shift-assignment and roster records.

Volunteer Management will define the detailed KELUARGA -> YM Hub handoff separately. Any batch or API process must include stable identifiers, validation, checksums/idempotency, history, exception handling and visible reconciliation state.

### Future: server-only Salesforce/YM Hub adapter

If approved after security review, a future adapter should:

- run only server-side;
- use least-privilege read scopes initially;
- map upstream data into the existing `ymhub` projection model;
- preserve visible freshness/failure states;
- be idempotent;
- retain audit/reconciliation capability;
- never expose Salesforce credentials to the browser.

The backend handoff mechanism may change without changing KELUARGA's ownership of the volunteer-facing recruitment/registration workflow or YM Hub's role as the authoritative organisational backend record.

### MakLom

Automatic KELUARGA -> MakLom synchronization remains intentionally off. The current procedure is to generate the event-operations report in KELUARGA and upload it to MakLom manually.

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
