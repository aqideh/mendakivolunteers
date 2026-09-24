# Development roadmap

**Last reviewed:** 24 September 2026

This roadmap reflects the current deployed implementation and the revised 24 September 2026 operating model. **KELUARGA owns volunteer recruitment, registration and live event operations. There is no planned KELUARGA-to-YM Hub handoff in the current roadmap. Downstream operational data will be handled through the existing MakLom report-upload process for now.** Existing YM Hub/Salesforce projection code is retained as dormant historical/future infrastructure, not as a current delivery dependency.

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
- app-owned prospective-volunteer recruitment intake with staff review and status history;
- news;
- standalone public FAQ route and navigation, with approved FAQ copy kept in a dedicated content module;
- KELUARGA-managed programme/event records for public opportunity discovery;
- direct KELUARGA registration with shift selection and status display;
- volunteer self-withdrawal and staff cancellation with audited status history and safe roster cleanup before attendance begins;
- Event Guides with venue, directions, briefing and programme information;
- published volunteer pathways;
- retired Volunteer.gov.sg runtime importer and imported-card override flow.

### Next work

**Content dependency:** the FAQ page is live as a content-ready shell; Volunteer Management still needs to furnish the approved questions and answers before it becomes a substantive support resource.

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
- compact mobile event-operations UI;
- Quick Event Operations for manual/last-minute events without a public opportunity;
- manual CSV/paste roster mode with an explicit isolated-versus-KELUARGA-integrated data boundary;
- integrated manual rosters and walk-ins can match existing volunteers or create new `KELxxxxx` volunteer records from strong identifiers;
- optional app-owned KELUARGA contribution-hour crediting from completed manual-event attendance, stored separately from YM Hub verified hours.

### Next work

**Live:** confirmed KELUARGA registrations populate Event Operations rosters idempotently with canonical volunteer and registration IDs; walk-ins remain an explicit exception.

**Current downstream handoff:** use the existing KELUARGA event report export and manual MakLom upload. No YM Hub export or reconciliation workflow is planned in this phase.

**Planned:** continue event-day UAT with realistic multi-shift rosters, walk-ins, early checkouts, incomplete attendance, manual isolated rosters and manual integrated rosters/hour crediting.

**Planned:** define explicit retention/support procedures for event-operation data and exported files.

## 4. KELUARGA registration and downstream handoff

**Status: KELUARGA recruitment/registration live. MakLom manual handoff is the current downstream process. YM Hub integration is deferred.**

Already implemented:

- native KELUARGA account provisioning with immutable `KELxxxxx` volunteer IDs;
- canonical programme/event records and direct opportunity registration;
- multi-shift selections and optional per-shift capacity;
- pending / confirmed / waitlisted / rejected / cancelled / withdrawn registration lifecycle;
- withdrawn/cancelled registrations can be reopened while the opportunity remains open;
- app-owned recruitment application lifecycle with volunteer submission/withdrawal and Volunteer Management review;
- staff registration review and in-app registration notifications;
- idempotent confirmed-registration-to-roster handoff;
- event-level reporting suitable for the current manual MakLom upload workflow.

### Current integration direction

**Status: Live manual process**

Current flow:

```text
KELUARGA recruitment / registration
        ->
KELUARGA event roster / attendance
        ->
KELUARGA event report export
        ->
manual upload to MakLom
```

There is no current requirement to export KELUARGA volunteer, registration or attendance data to YM Hub.

The existing `ymhub` projection schema, snapshot tables and Salesforce-oriented reconciliation code should remain dormant unless a future integration project explicitly reactivates them. Do not build new product flows around those projections.

### Identity

The active KELUARGA identity chain is:

```text
Supabase Auth user
        -> core.user_accounts
        -> core.volunteers.id
        -> core.volunteers.volunteer_code (immutable KELxxxxx ID)
```

MakLom handoff should use stable KELUARGA identifiers where the receiving process supports them, plus explicit matching/review rules. Do not use volunteer names alone as a permanent cross-system identity.

### Future YM Hub / Salesforce integration

**Status: Deferred; not a planned slice**

No direct or batch KELUARGA-to-YM Hub integration should be built at present. Existing integration foundations may be retained for possible future use, but they are not a launch dependency and should not appear as an unfinished volunteer workflow.

## 5. Personal volunteer dashboard

**Status: KELUARGA account, registration, profile and journey surfaces live**

Implemented:

- KELUARGA volunteer ID display;
- KELUARGA registration status and recent in-app registration updates;
- separately labelled app-owned KELUARGA contribution hours from integrated manual events;
- registration self-withdrawal;
- audited self-service editing for app-owned display name and mobile number;
- points, badges and staff-confirmed pathway positions.

### Next work

**Planned:** remove or hide volunteer-facing YM Hub linkage/sync states and other backend-reconciliation UI that no longer reflects the current operating model. Retain dormant integration tables/code only where removing them would create unnecessary migration risk.

**Decision required:** define which attendance/hour measure KELUARGA should present as the primary volunteer-facing record before replacing legacy verified-hours surfaces. Until then, app-owned contribution hours must remain clearly labelled and must not be silently renamed as verified hours.

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

**Policy dependency:** attendance-derived points should remain disabled until Volunteer Management defines the trusted attendance/hour source under the KELUARGA + MakLom operating model. Do not retain YM Hub import as an artificial prerequisite.

**Live:** manual badges can be defined, awarded and revoked by authorised gamification staff with explicit reasons and retained history. Automatic badge/milestone earning remains unimplemented until criteria and correction rules are approved.

**Planned:** referral rewards only after KELUARGA can confirm the referred person reached the required eligibility/registration milestone under an approved anti-abuse rule.

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

**Current:** event reports and accepted operational data can be handed to MakLom through the existing manual export/upload process.

**Deferred:** automatic MakLom synchronization. If automation is later introduced, use explicit identity matching, provenance and human review; do not write accepted event observations directly into a canonical central volunteer profile.

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

## 10. MakLom handoff

**Status: Manual process live; automation deferred**

Current state:

- KELUARGA event reports are exported and uploaded to MakLom manually where required;
- no server-to-server write;
- no automatic volunteer-profile mutation;
- KELUARGA insights/reviews may be included in controlled downstream reporting.

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

### Slice 9 — operating-model cleanup and launch hardening

1. Remove/hide volunteer-facing YM Hub linkage, sync and backend-profile states that are no longer part of the operating model.
2. Confirm Event Guide access rules for public versus authenticated/assigned content.
3. Complete realistic event-day UAT across multi-shift attendance, walk-ins, early checkout, QR, isolated manual events and integrated manual events.
4. Define retention/support procedures for Event Operations data and exported files.
5. Validate the MakLom export/upload procedure end to end.

### Slice 10 — gamification activation

1. Approve point values, eligible actions, effective dates and correction/appeal rules.
2. Decide which KELUARGA/MakLom attendance outcome can safely trigger attendance-derived points.
3. Implement automatic badge/milestone criteria with auditable reversals/corrections.
4. Preserve manual staff recognition as a separate provenance.

### Slice 11 — volunteer-management intelligence

1. Build a cross-event staff view of accepted volunteer insights and review history.
2. Add appropriate access controls, context and correction/retention rules.
3. Improve staff search/filtering across volunteer participation history without turning event reviews into permanent character labels.

### Slice 12 — longitudinal impact reporting

1. Agree metric definitions and deduplication rules.
2. Build cross-event reporting for unique volunteers, deployments, event participations, attendance sessions, repeat engagement, contribution hours and feedback outcomes.
3. Make denominators and counting rules explicit so multi-shift participation is not double counted.

### Slice 13 — referrals

1. Implement stable referral codes/links.
2. Define the successful-referral milestone.
3. Add anti-abuse and duplicate/self-referral safeguards.
4. Award referral points only after the approved KELUARGA milestone is reached.

### Later / optional

- pathway recommendations using reviewed skills/interests;
- automated MakLom synchronization, only as a separately reviewed integration project;
- YM Hub/Salesforce integration, only if the operating model changes again;
- SSO as a separate future identity project.

## Delivery rules

- `main` remains deployable production code.
- Use short-lived branches and pull requests for changes.
- Database changes require forward-only migrations and pgTAP coverage where applicable.
- User-facing feature changes should update `docs/feature-inventory.md` and this roadmap.
- Newly confirmed material defects should be tracked as GitHub Issues and reflected in `docs/known-issues.md`.
- External integrations stay server-only, least-privilege, observable and fail closed.
- Do not represent a foundation/schema as a live operational integration until real source data and workflows are running.
