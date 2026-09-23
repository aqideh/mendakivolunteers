# Development roadmap

**Last reviewed:** 23 September 2026

This roadmap reflects both the current deployed implementation and the approved 22 September 2026 operating-model change. **KELUARGA will own volunteer recruitment, registration and live event operations; YM Hub remains the authoritative backend organisational record after handoff/reconciliation.** Verified volunteer hours remain YM Hub-owned.

## Status labels

- **Live** — implemented on `main` and used by the application.
- **Foundation live** — schema/read path exists, but production value depends on policy or upstream data.
- **Planned** — agreed future work, not yet implemented.
- **Blocked / dependency** — requires external data, approval or operating process.
- **Deferred** — intentionally not being built now.
- **Decision required** — product/operations/security rule must be settled before implementation.

## 1. Platform, security and release controls

**Status: Live**

Implemented:

- Next.js/Vercel application.
- Supabase Auth and PostgreSQL backend.
- role-gated staff functions;
- Row Level Security and privileged server/service-role boundaries;
- forward-only database migrations;
- pgTAP database/RLS tests;
- Vitest application tests;
- lint, type-check, production build and dependency audit in CI;
- production-readiness checks;
- security headers, redirect validation and CSV injection protection;
- production handover/runbook documentation.

Ongoing work:

- keep dependencies patched;
- preserve regression coverage when adding operational features;
- periodically rerun security/source scans for DTI review;
- document material architecture changes in the same pull request.

## 2. Public volunteer companion and CMS

**Status: Live**

Implemented:

- landing page;
- opportunity discovery;
- news;
- KELUARGA-managed programme/event records for public opportunity discovery;
- direct KELUARGA registration with shift selection and status display;
- Event Guides with venue, directions, briefing and programme information;
- published volunteer pathways;
- retired Volunteer.gov.sg runtime importer and imported-card override flow.

### Next work

**Planned:** add audited volunteer/staff cancellation and withdrawal handling on top of the first-class registration lifecycle.

**Decision required:** confirm which Event Guide content can be public and which content requires authentication, assignment, access code or signed-link access.

## 3. Staff event operations

**Status: Live**

Implemented:

- event creation/editing;
- multi-day/multi-shift timeslots;
- roster upload/paste/template;
- optional Volunteer ID;
- walk-ins;
- dietary/contact/T-shirt fields;
- check-in/check-out;
- absent/withdrawn states;
- bulk checkout;
- audited corrections;
- continuous attendance across shifts;
- live attendance monitor;
- attendance reconciliation view;
- attendance export;
- QR attendance/feedback foundation;
- Past Events search/filter/sort;
- compact mobile event-operations UI.

### Next work

**Live:** confirmed KELUARGA registrations populate Event Operations rosters idempotently with canonical volunteer and registration IDs; walk-ins remain an explicit exception.

**Planned:** complete formal backend-handoff tracking for operational attendance sent to YM Hub, including:

- batch IDs;
- source attendance IDs;
- assignment matching;
- walk-in/missing-assignment exceptions;
- duplicate-export prevention;
- accepted/rejected downstream outcome where available.

**Planned:** continue event-day UAT with realistic multi-shift rosters, walk-ins, early checkouts and incomplete attendance.

**Planned:** define explicit retention/support procedures for event-operation data and exported files.

## 4. KELUARGA registration and YM Hub backend handoff

**Status: KELUARGA registration foundation live. YM Hub reconciliation foundation live.**

Already implemented:

- native KELUARGA account provisioning with immutable `KELxxxxx` volunteer IDs;
- canonical programme/event records and direct opportunity registration;
- multi-shift selections and optional per-shift capacity;
- pending / confirmed / waitlisted / rejected registration lifecycle;
- staff registration review and in-app registration notifications;
- idempotent confirmed-registration-to-roster handoff;
- `ymhub` projection schema, attendance snapshots and sync/freshness state;
- verified-hours presentation and gamification reconciliation contract.

### Immediate integration direction

**Status: Planned / operating-process dependency**

KELUARGA must no longer wait for inbound YM Hub registration data to operate. Volunteer Management will separately define the KELUARGA -> YM Hub handoff. Controlled batch files remain the immediate practical mechanism where required.

Target inbound source sets:

1. Person Account;
2. Volunteer Initiative;
3. Job Position Shift;
4. Job Position Assignment.

Build a staff-only batch workflow with:

- versioned expected templates;
- schema/header validation;
- preview before commit;
- stable Salesforce source IDs;
- checksum/duplicate-file detection;
- atomic or explicitly documented partial-failure behaviour;
- import counts and history;
- uploader/time/source metadata;
- exception reports;
- previous successful snapshot retention;
- freshness/failure state surfaced to volunteers/staff.

### Identity linking

**Status: Native identity and account/profile provisioning live**

Use the identity chain:

```text
Supabase Auth user
        -> core.user_accounts
        -> core.volunteers.id (internal UUID)
        -> core.volunteers.volunteer_code (immutable KELxxxxx ID)
        -> optional Salesforce/YM Hub source ID after handoff
```

Implemented / ongoing:

- verified email signup can create a native KELUARGA volunteer before any YM Hub record exists;
- every native volunteer receives an immutable `KELxxxxx` ID;
- an exact eligible legacy email match can be linked without creating a duplicate volunteer;
- ambiguous legacy matches enter a review state instead of auto-linking;
- controlled backend source-ID linking/reconciliation and support tooling remain ongoing.

Do not allow volunteers to claim a profile by typing an unverified source ID or email address.

### Future direct API

**Status: Blocked / future**

After DTI/security approval, replace the batch ingestion mechanism with a server-only, least-privilege Salesforce/YM Hub adapter.

The adapter should populate the existing `ymhub` projection model so volunteer pages do not need to be redesigned.

Requirements:

- no Salesforce credential in browser code;
- typed field mappings;
- idempotent upserts;
- explicit freshness/failure states;
- auditability and observability;
- safe handling of deletions, merges, status corrections and changed upstream records;
- batch import/export retained as fallback/recovery where useful.

### SSO

**Status: Not in current phase**

KELUARGA and YM Hub remain separate login/session systems. Reassess SSO only as a separate identity project if later approved.

## 5. Personal volunteer dashboard

**Status: UI live with KELUARGA registration state and YM Hub verification separated**

Implemented:

- KELUARGA volunteer ID display;
- KELUARGA registration status and recent in-app registration updates;
- linked/unlinked YM Hub reconciliation state;
- imported YM Hub registrations as a legacy/backend reconciliation view;
- imported official attendance;
- verified hours;
- sync/failure state handling;
- audited self-service editing for app-owned display name and mobile number.

### Next work

**Planned:** add registration cancellation/withdrawal self-service with audited state transitions. Keep login email, KELUARGA ID and backend identifiers outside ordinary profile editing.

**Planned:** operate the required YM Hub backend projections reliably through the agreed handoff process.

**Planned:** ensure all personal authoritative data surfaces show last successful sync/freshness information and distinguish `not yet synchronised` from a true empty record.

**Planned:** support staff resolution of identity/assignment exceptions before broad volunteer account rollout.

## 6. Gamification and recognition

**Status: Recognition foundation live; policy and authoritative data dependencies remain**

Implemented:

- versioned point-rule model;
- flat-points and per-hour rules;
- append-only point ledger;
- adjustments/reversals;
- account-scoped points UI;
- reconciliation from verified YM Hub attendance;
- role-gated staff points management for explicit manual recognition awards;
- separate point provenance for verified attendance versus staff recognition;
- staff-defined recognition badges with audited award/revocation history;
- volunteer-facing active badge summary.

### Next work

**Policy dependency:** approve verified-attendance point values, eligible activity rules, effective dates, corrections/appeals and anti-abuse controls before activating production attendance rules. Manual recognition is operationally available but should follow an agreed staff-use policy.

**Integration dependency:** only reconcile points after a successful authoritative YM Hub attendance import.

**Live:** manual badges can be defined, awarded and revoked by authorised gamification staff with explicit reasons and retained history. Automatic badge/milestone earning remains unimplemented until criteria and correction rules are approved.

**Planned:** referral rewards only after an authoritative referral outcome can confirm the referred person reached the required eligibility/registration milestone.

## 7. Volunteer pathways

**Status: Map management and staff-confirmed personal positioning live**

Implemented:

- Explorer start;
- four pathway tracks;
- stages/roles;
- staff draft/preview/publish workflow;
- immutable published versions;
- role-gated management.

Implemented personal positioning:

- staff-managed position assignment using `core.volunteers.id` and stable stage keys;
- one active position per volunteer per pathway track;
- retained assignment history and audit events;
- volunteer-facing current positions on My Profile and the pathway map;
- no automatic advancement from attendance, registration or points.

### Next work

**Future:** pathway recommendations using reviewed skills/interests/experience may be considered, but should remain explainable and staff-overridable.

## 8. Volunteer Insights and Reviews

**Status: Live**

Implemented:

- inline event insight capture;
- structured categories and source type;
- submitted/accepted/dismissed review flow;
- volunteer reviews with 1–5 event-role performance rating;
- positive/concern behaviour tags;
- comments/follow-up flag;
- multiple staff reviewers;
- integration into event reporting/export.

### Next work

**Planned:** cross-event staff view of accepted insights/review history where operationally useful, with appropriate access controls and context.

**Decision required:** define retention, visibility and correction rules before reviews become a major longitudinal decision input.

**Deferred:** automatic MakLom handoff.

If the MakLom handoff is reactivated, use an inbox/matching/review workflow. Do not write accepted event observations directly into the canonical central volunteer profile.

## 9. Feedback and impact reporting

**Status: Event-level foundation live; longitudinal analytics planned**

Implemented:

- event feedback capture;
- event report export including roster, attendance, continuous-attendance state, dietary data, insights, reviews and feedback.

### Next work

**Planned:** define an impact reporting model that separates:

- unique volunteers;
- deployments/roster rows;
- event participations;
- shifts;
- attendance sessions;
- verified volunteer hours;
- repeat engagement;
- feedback outcomes;
- skill/interest development where evidence exists.

**Planned:** create cross-event dashboards only after metric definitions are approved so multi-shift volunteers are not double counted unintentionally.

Potential future metrics include deployment count, attendance rate, repeat participation, retention, contribution mix and feedback trends. Each metric must state its denominator and deduplication rule.

## 10. MakLom integration

**Status: Deferred**

Current state:

- no server-to-server write;
- no automatic volunteer-profile mutation;
- KELUARGA insights may be manually exported.

Future option:

```text
KELUARGA accepted insight
        -> MakLom inbox
        -> identity matching
        -> human review/edit/dismiss
        -> optional canonical profile attribute
```

Do not use KELUARGA `attendance_person_key` as the canonical MakLom identity.

## 11. Prioritised delivery order

### P0 — protect and operationalise what is already live

1. Maintain CI/security/database regression coverage.
2. Complete realistic event-day UAT for attendance, continuous shifts, walk-ins, QR and reconciliation.
3. Keep Event Guide access policy and registration-state messaging explicit.
4. Maintain operational runbooks, support ownership and rollback procedures.

### P1 — make the YM Hub batch integration operational

1. Obtain/freeze source templates, field mappings and status mappings.
2. Build the batch import centre and exception reporting.
3. Implement identity-link exception/support workflow.
4. Implement formal attendance export-batch tracking and downstream reconciliation.
5. Test deletions, merges, changed registrations and corrected attendance.

### P2 — broaden reliable personalised volunteer features

1. Operate reliable production registration/attendance snapshots.
2. Show freshness/staleness consistently.
3. Roll out personal account linking/support at scale.
4. Activate gamification rules only after policy approval and verified data flow.
5. Operate staff-confirmed pathway positioning and define any future advancement criteria before automation.

### P3 — improve volunteer-management intelligence

1. Cross-event insights/review views.
2. Longitudinal impact reporting.
3. Referral outcome integration.
4. Optional MakLom reviewed inbox if the product decision changes.

### P4 — future enterprise integration

1. Complete required source/security review.
2. Introduce server-only Salesforce/YM Hub API adapter if approved.
3. Retain recovery/batch paths.
4. Assess SSO separately if there is a later organisational requirement.

## Delivery rules

- `main` remains deployable production code.
- Use short-lived branches and pull requests for changes.
- Database changes require forward-only migrations and pgTAP coverage where applicable.
- User-facing feature changes should update `docs/feature-inventory.md` and this roadmap.
- Newly confirmed material defects should be tracked as GitHub Issues and reflected in `docs/known-issues.md`.
- External integrations stay server-only, least-privilege, observable and fail closed.
- Do not represent a foundation/schema as a live operational integration until real source data and workflows are running.
