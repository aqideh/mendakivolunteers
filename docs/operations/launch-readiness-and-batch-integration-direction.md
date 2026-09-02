# KELUARGA launch progress and batch integration direction

**Last updated:** 2 September 2026  
**Repository:** `aqideh/mendakivolunteers`  
**Status:** Working decision record and implementation handover

> **Repository visibility:** This repository is public. This note intentionally excludes personal contact details, verbatim internal correspondence, and commercial pricing. Refer to the internal DTI/CWS email thread and approved Change Request for those details.

## Executive summary

The app has progressed from a public opportunity/event-guide prototype into a usable staff event-operations system. Staff can now load rosters, organise volunteers by day and shift, record attendance, handle walk-ins and non-attendance, and export an auditable attendance record.

The integration direction has also changed. DTI has confirmed that the immediate YM Hub integration will use controlled batch-file processing rather than a live API, and KELUARGA and YM Hub will retain separate user logins. SSO is not available in this phase. A source-code security scan is required before DTI will consider a future API integration.

The recommended launch sequence is therefore:

1. Launch KELUARGA as a public volunteer companion and staff event-operations tool.
2. Pilot controlled YM Hub CSV imports and KELUARGA attendance exports internally.
3. Add personalised volunteer accounts only after identity matching and batch assignment data are reliable.
4. Replace the batch ingestion mechanism with an API adapter later without changing the internal read model.

KELUARGA must not be presented as the source of truth for volunteer identity, registration, official attendance or verified hours. Those remain authoritative in YM Hub.

---

## 1. Progress completed during this development session

### Staff event roster and attendance operations

The following staff-facing capabilities are implemented and deployed:

- Staff-only Event Operations area at `/admin/events`.
- Event rosters organised by event day and shift/timeslot.
- Roster display includes volunteer name, contact number and T-shirt size.
- CSV roster upload with preview and validation.
- Direct roster pasting from Excel, Google Sheets or CSV text.
- Volunteer ID is optional because it is not yet implemented organisation-wide.
- Duplicate matching uses available identifiers rather than requiring a Volunteer ID.
- One-tap staff check-in and check-out with timestamps.
- Separate audited correction flow for manually changing or clearing timestamps.
- Attendance CSV export.
- Staff dashboard link to Event Operations.
- Events older than two weeks are moved to a Past Events page with search, date filtering, sorting and pagination.
- Walk-in/last-minute volunteers can be added to the selected shift and optionally checked in immediately.
- Walk-in records are visibly labelled and included in attendance exports.
- Staff can mark a volunteer as `withdrawn` or `absent`, undo that status, filter by it and export it.
- Mobile Event Operations has a compact roster layout, persistent filter bubble, horizontal shift/metric controls and a collapsed walk-in form.
- Staff can check out all volunteers who are currently checked in for the selected shift after confirming the action.

### Authentication, security and data-integrity work

The following reliability and security improvements were completed:

- Password-recovery links now open a password-reset flow instead of treating recovery as an ordinary magic-link sign-in and redirecting to the dashboard.
- Singapore mobile numbers are canonicalised more consistently for roster duplicate checks.
- Duplicate detection was hardened across available identifiers.
- Attendance transitions are enforced server-side so invalid check-out/check-in combinations cannot be created merely by bypassing the UI.
- Duplicate walk-in handling was improved.
- Supabase migration history was reconciled where earlier production and repository migration identifiers had drifted.
- Supabase SSR session-refresh forwarding was corrected so authenticated server requests do not continue using stale JWT cookies.
- Attendance status changes remain restricted to authorised staff and use the existing immutable audit trail.

### Relevant pull requests

| PR | Delivered outcome |
|---|---|
| #52 | Staff shift roster and check-in/check-out foundation |
| #53 | Optional Volunteer ID and pasted-roster import |
| #54 | Event Operations dashboard link and roster compaction |
| #55 | Past Events archive with search/filter/sort |
| #56 | Correct password-recovery flow |
| #57 | Walk-in/last-minute volunteer registration and check-in |
| #58 | Attendance and roster integrity hardening |
| #66 | Supabase session-refresh forwarding fix |
| #67 | Withdrawn and absent attendance states |
| #69 | Compact mobile Event Operations roster and persistent filter control |
| #70 | Bulk checkout for all currently checked-in volunteers in a shift |

Related product work in PR #68 changed the public product identity to **KELUARGA — MENDAKI Volunteer App**.

At the time this note was written, `main` was at merge commit `19cfb46e1a50cd5ae9ee93c2f4295f952f271cb8` after PR #70. The above changes had passed the repository's web application, dependency audit, Supabase migration and database/RLS checks before deployment.

---

## 2. Current production position

The production app already has real staff event guides, roster assignments and operational attendance records. The staff operations side is therefore not only a prototype.

However, the personalised YM Hub read-model layer has not yet been populated with production volunteer identity, registration or verified-attendance snapshots. This distinction is important:

- **Ready for operational use:** public content, event guides and staff attendance operations.
- **Not yet ready for general volunteer account rollout:** reliable YM Hub identity linking, personalised assignments, official attendance history and verified hours.

The existing `ymhub.*` projection schema remains useful. It was designed to receive authoritative data from a future server-side API adapter, but the same projection tables can be populated through a controlled batch importer in the interim. The ingestion mechanism can change later without redesigning the volunteer dashboard.

---

## 3. Direction confirmed by DTI and CWS

The immediate integration approach is batch-file processing.

### Salesforce/YM Hub to KELUARGA

CWS has scoped standard Salesforce report exports for:

1. **Person Account** — volunteer identity/profile information.
2. **Volunteer Initiative** — activity/programme information.
3. **Job Position Shift** — session and shift information.
4. **Job Position Assignment** — assignment, attendance and volunteer-hour information.

### KELUARGA to Salesforce/YM Hub

KELUARGA will generate a CSV for import through the Salesforce Data Import Wizard, targeting Job Position Assignment attendance records captured by the app.

### Authentication direction

- KELUARGA and YM Hub must maintain separate user accounts and sessions during the batch phase.
- SSO cannot be implemented at this stage.
- The same email address may be used for familiarity, but passwords, password resets, lockouts and sessions remain separate.
- KELUARGA must not imply that signing in to one system signs the volunteer in to the other.

### Future API direction

DTI requires a source-code scan before considering API integration. A later API integration should replace the batch ingestion/export mechanism, not alter the system-of-record boundaries.

A formal costed Change Request exists and will require internal acceptance and procurement. Commercial information remains in the internal correspondence rather than this public repository.

---

## 4. System ownership and source-of-truth boundaries

| Data or function | Authoritative owner | KELUARGA treatment |
|---|---|---|
| Volunteer profile and status | YM Hub | Read-only batch projection |
| Salesforce Person Account ID | YM Hub | Hidden stable identity link |
| KELUARGA login credentials | KELUARGA / Supabase Auth | App-owned, separate from YM Hub |
| Opportunity/activity structural record | YM Hub or agreed export source | Imported and reconciled |
| Opportunity copy, images and presentation | KELUARGA | Managed in the app CMS |
| Registration, waitlist and cancellation | YM Hub | Delayed read-only snapshot |
| Event guide, briefing, directions and operational instructions | KELUARGA | App-owned |
| Event-day check-in/check-out | KELUARGA | Operational record pending transfer |
| Withdrawn/absent event-day status | KELUARGA initially | Must map to agreed YM Hub values/process |
| Official attendance | YM Hub | Authoritative snapshot imported back into KELUARGA |
| Verified volunteer hours | YM Hub | Read-only; never calculated as final solely from KELUARGA timestamps |
| Gamification based on attendance | KELUARGA | Award only after authoritative YM Hub verification |
| News and volunteer pathways | KELUARGA | App-owned |

The volunteer-facing distinction should be explicit:

- **Attendance captured in KELUARGA** means an operational event-day record exists.
- **Attendance verified in YM Hub** means the official record and hours have been processed by the organisation.

---

## 5. Recommended volunteer flow during the batch phase

| Stage | Volunteer experience | Responsible system |
|---|---|---|
| Discover | Browse opportunities without signing in | KELUARGA |
| Register | Tap the registration button and continue to the official external registration portal | YM Hub / approved public registration front end |
| Immediate confirmation | Receive the authoritative registration response | YM Hub |
| Registration shown in KELUARGA | Appears after a later batch import, with a visible last-updated time | YM Hub to KELUARGA batch |
| Prepare | View event date, briefing, directions, attire and operational guidance | KELUARGA |
| Attend | Staff record check-in/out, absence, withdrawal and walk-ins | KELUARGA operational attendance |
| Reconcile | Staff review exceptions and generate the approved attendance CSV | KELUARGA |
| Verify | Attendance and hours are imported, checked and verified | YM Hub |
| View official record | Verified attendance and hours appear after a subsequent export/import cycle | YM Hub to KELUARGA batch |

Recommended user-facing explanation:

> KELUARGA helps volunteers discover, prepare for and attend MENDAKI volunteer activities. YM Hub manages registration and the official volunteering record.

Recommended registration transition copy:

> Continue to the official registration portal. You may be asked to sign in separately. Your registration status will appear in KELUARGA after the next data update.

Recommended KELUARGA login copy:

> Sign in to KELUARGA using the email associated with your volunteer profile. KELUARGA and YM Hub use separate sign-ins.

---

## 6. Identity linking without an organisation-wide Volunteer ID

The lack of a universal human-readable Volunteer ID should not block the batch pilot.

Use this internal identity chain:

```text
Supabase Auth user UUID
        <->
KELUARGA internal volunteer UUID
        <->
Salesforce Person Account record ID
```

The Salesforce Person Account record ID should be the stable source identifier. It should remain hidden from volunteers.

Email is appropriate for invitations and exception handling, but it should not be the only reconciliation key because email addresses can change, be duplicated, be mistyped or occasionally be shared.

Recommended account-provisioning process:

1. Import Person Account records first.
2. Upsert the internal volunteer projection using Salesforce Person Account ID.
3. Match the exported email to an existing KELUARGA account where possible.
4. Create a pending invitation where no account exists.
5. Require the volunteer to verify access to that email before linking the Supabase account.
6. Send ambiguous matches to a staff exception queue.
7. Never allow a volunteer to claim an identity merely by typing a Volunteer ID, Person Account ID or unverified email address.

---

## 7. Batch-processing design

### Import pipeline

KELUARGA should gain a staff-only **YM Hub Batch Centre** with separate import types for:

- Person Account;
- Volunteer Initiative;
- Job Position Shift;
- Job Position Assignment.

Each import should support:

- expected-template download;
- schema/header version checking;
- preview before committing;
- insert/update/cancellation counts;
- strict validation of identifiers, timestamps and status values;
- duplicate-file detection using a checksum;
- atomic commit or a clearly defined partial-failure policy;
- retained previous successful snapshot;
- batch ID, uploader, time and source-file metadata;
- downloadable exception report;
- import history and operational audit trail.

Unexpected status values should fail validation and enter an exception report rather than being silently converted to an `unknown` state.

### Attendance export pipeline

KELUARGA attendance export should classify records before producing the Salesforce import file:

| Export state | Meaning |
|---|---|
| Ready | Person, shift and assignment identifiers are available |
| Needs assignment match | Person and shift are known but Job Position Assignment ID is missing |
| Walk-in exception | The volunteer was added on-site and may not have an existing assignment |
| Incomplete attendance | Checked in but not checked out |
| Excluded | Withdrawn, cancelled, test or invalid record according to the agreed rule |
| Already exported | Included in an earlier successful export batch |

Each export should record:

- unique export batch ID;
- generation timestamp;
- event and shift;
- staff member generating the file;
- row count and file checksum;
- source operational attendance IDs;
- export status per row;
- later accepted/rejected outcome where this can be captured.

Raw batch files contain personal data and must use a DTI-approved transfer/storage location. Ordinary email should not become the default file-transfer mechanism. Retention and deletion periods must be documented.

---

## 8. Volunteer-facing UX changes required by the new direction

### A. Do not put volunteer accounts on the first-launch critical path

Public opportunity discovery and event preparation should remain usable without a KELUARGA login. This lets the organisation launch while the batch identity process is still being built and tested.

### B. Make the two-system boundary visible

The app must consistently distinguish:

- KELUARGA sign-in;
- external registration-portal sign-in;
- operational attendance captured by KELUARGA;
- official attendance and hours verified in YM Hub.

### C. Resolve the registration destination name

Current product copy has referred to both `Volunteer.gov.sg` and `YM Hub`. DTI/CWS must confirm the name and destination that volunteers actually see after tapping Register. The app should use one consistent public-facing term while preserving the internal system name where needed for staff documentation.

### D. Rename `My Journey` until it is actually personalised

The current Journey page displays published event guides rather than only events assigned to the signed-in volunteer. During the batch/public phase, the clearer label is **Event Guides**.

`My Journey` or `My Upcoming Events` should return only when Job Position Assignment imports can reliably personalise the list.

### E. Show data freshness

Any imported registration, assignment, attendance or hour record should show:

- the last successful YM Hub data update;
- a clear stale-data warning if the latest batch failed;
- an explicit not-yet-synchronised state rather than an empty list that appears authoritative.

### F. Review public event-guide access

Published event guides may contain WhatsApp links, briefings, programme rundowns and detailed operational information. `noindex` is not access control.

Before broad public launch, decide whether sensitive sections require:

- an authenticated assignment;
- an event access code; or
- a signed direct link sent to confirmed volunteers.

Because batch assignments can lag, an event access code or signed link may be the more practical launch bridge.

---

## 9. Recommended staged release plan

### Stage 1 — Public companion and staff operations

Launch:

- public landing page;
- opportunity discovery;
- external registration links;
- event guides, briefing and directions;
- news and public pathways content;
- staff event operations;
- roster upload/paste;
- walk-ins;
- check-in, check-out, withdrawn and absent;
- bulk checkout and attendance export.

Do not require a volunteer KELUARGA account for ordinary browsing or event preparation.

### Stage 2 — Internal batch pilot

Build and test:

- Person Account importer;
- Volunteer Initiative importer;
- Job Position Shift importer;
- Job Position Assignment importer;
- identity matching and exception queue;
- attendance reconciliation and approved Salesforce export;
- batch history, checksums and error reports;
- end-to-end tests using anonymised CWS sample files.

Use a small group of staff and test volunteers first.

### Stage 3 — Personalised volunteer accounts

Enable only after the batch pilot is stable:

- controlled volunteer invitations;
- KELUARGA-specific account activation;
- personalised upcoming assignments;
- registration/waitlist/cancellation status;
- official attendance history;
- verified volunteer hours;
- data-freshness and sync-failure messaging;
- support workflow for missing or incorrect links.

### Stage 4 — API integration and possible SSO work

After source-code scan approval:

- replace batch ingestion with a server-only YM Hub adapter;
- keep the same canonical projection tables and UI contracts;
- retain batch import/export as a fallback and recovery mechanism;
- assess SSO as a separate identity project rather than assuming API access provides it automatically.

---

## 10. Priority work before public go-live

### P0 — Required before broad launch

1. Confirm the public name and URL of the official registration destination.
2. Standardise all registration copy across landing, opportunity and event-guide pages.
3. Rename public `My Journey` navigation to `Event Guides` until assignment personalisation exists.
4. Decide whether volunteer sign-in is hidden, role-neutral or separated from staff sign-in during Stage 1.
5. Review WhatsApp, briefing and programme-rundown access on public event guides.
6. Freeze a release-candidate commit for the DTI source-code scan.
7. Prepare the security and architecture pack described below.
8. Define production support ownership, incident contacts and rollback procedure.
9. Complete mobile event-day user acceptance testing with a realistic roster.
10. Document how staff reconcile incomplete attendance, absences, withdrawals and walk-ins after each event.

### P1 — Required for the batch pilot

1. Obtain final CSV headers, data types, sample rows and status mappings from CWS.
2. Confirm whether Job Position Assignment includes future registrations/waitlists or only completed attendance/hours.
3. Implement the YM Hub Batch Centre and exception reports.
4. Implement stable Person Account ID linking.
5. Add export-batch tracking so the same operational attendance row is not accidentally exported twice.
6. Agree the walk-in and missing-assignment process.
7. Test deletion, merge, inactive-volunteer and corrected-attendance behaviour.

### P2 — Required for personalised volunteer rollout

1. Controlled volunteer account invitation and email verification.
2. Personalised assignment-based Event Guides/My Journey.
3. Official attendance and verified-hour presentation.
4. Clear sync timestamps and stale/failure states.
5. Support queue for identity and assignment mismatches.
6. Gamification only from returned, verified YM Hub records.

---

## 11. Source-code scan preparation

The security submission should assess one fixed release-candidate commit and include:

- application architecture and data-flow diagram;
- system-of-record and trust-boundary description;
- personal-data inventory;
- authentication and role matrix;
- Supabase RLS and privileged-service design;
- secret-management approach;
- dependency vulnerability report;
- static application security scan;
- secret scan;
- software bill of materials;
- production environment inventory;
- backup, recovery and rollback process;
- logging, monitoring and incident response process;
- external services and data processors;
- batch-file transfer, retention and deletion rules;
- open findings, owners and remediation dates.

Feature development can continue on another branch after the candidate is frozen, but the scanned release branch should receive only reviewed security fixes until the assessment is complete.

---

## 12. Questions that must be resolved with DTI/CWS

1. What DTI-approved location will receive Salesforce exports and KELUARGA imports?
2. Are Salesforce exports manual, scheduled or both?
3. What is the normal batch cadence and expected maximum delay?
4. Does Job Position Assignment include future registered/waitlisted volunteers?
5. Will every file include stable Person Account, Initiative, Shift and Assignment record IDs?
6. Can the Data Import Wizard create a Job Position Assignment for a walk-in, or only update an existing one?
7. What are the exact source picklist/API values for registration, waitlist, cancellation, withdrawal, absence, attendance and verification?
8. How are merged, deleted and inactive Person Accounts represented?
9. What timezone and timestamp format will all files use?
10. How are corrected attendance records and re-imports handled?
11. How will rejected Salesforce import rows be returned to the Volunteer Management team?
12. Who is responsible for generating exports, uploading imports and resolving exceptions?
13. What is the source-code scan tool, scope, severity threshold and formal pass criterion?
14. What public-facing registration-system name should KELUARGA display?
15. What batch-file retention period is approved?

---

## 13. Decisions and guardrails

Unless formally changed, future implementation should follow these rules:

- No SSO claim during the batch phase.
- No shared-password or password-synchronisation design between KELUARGA and YM Hub.
- No volunteer self-claiming of a YM Hub identity through an entered ID or unverified email.
- No representation of batch data as real-time.
- No final/verified hours calculated solely from KELUARGA event timestamps.
- No permanent attendance-based points until YM Hub verification returns.
- No silent dropping of walk-ins or unmatched records from attendance exports.
- No silent conversion of unknown source statuses.
- No replacement of the canonical KELUARGA data model with Salesforce-specific field names.
- No public exposure of raw batch files, internal contacts or commercial information.
- Preserve the batch path as a fallback even after an API integration is introduced.

---

## 14. Related repository documents

- [`docs/architecture/phase-3-ymhub-read-model.md`](../architecture/phase-3-ymhub-read-model.md) — authoritative YM Hub projection and availability-state design.
- [`docs/ymhub-field-request.md`](../ymhub-field-request.md) — source-object and field-contract questions; this should be extended with the final CSV batch specification.
- [`docs/development-roadmap.md`](../development-roadmap.md) — wider product roadmap.
- [`docs/operations/production-handover.md`](./production-handover.md) — production operations and handover reference.

## Next documentation update

Update this note after DTI/CWS confirm the file samples, cadence, registration destination, Job Position Assignment semantics and source-code scan requirements. The next revision should include the agreed batch schemas and a RACI for each import/export step.
