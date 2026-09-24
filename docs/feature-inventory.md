# Feature inventory

**Snapshot date:** 24 September 2026  
**Reference branch:** `main`  
**Reference commit at start of review:** `aacb313211268bd76c7de6d2b3c35939c9317b90`

This file records implemented capability, not aspirational scope. A feature is listed as implemented when the current application or production migrations contain the relevant routes, actions, schema and tests.

## 1. Public volunteer experience

### Landing and discovery

Implemented:

- Branded KELUARGA landing page.
- Public opportunity browsing and opportunity detail pages.
- In-app prospective-volunteer recruitment intake with role-interest, motivation, skills/experience and availability fields.
- Volunteer Management review workflow with submitted, reviewing, accepted, not-selected and withdrawn recruitment states.
- Public news listing and news detail pages.
- Public FAQ route linked from the global menu, with accessible native disclosure controls ready for approved content.
- Public volunteer pathways page.
- KELUARGA-owned programme/event records drive the opportunity listing, Event Guides and Event Operations.
- Volunteers can register directly in KELUARGA and select one or more available shifts.
- Registrations use explicit pending, confirmed, waitlisted, rejected, cancelled and withdrawn lifecycle states.
- Volunteers can withdraw before attendance starts; authorised staff can cancel with a reason; safe roster rows are removed while registration/history remains.
- Withdrawn or cancelled registrations can be resubmitted while the opportunity remains open.
- Confirmed registrations populate Event Operations directly with stable registration and volunteer references.
- Per-shift capacity can be configured and is enforced transactionally at confirmation.
- Registration submission/status changes create in-app volunteer notifications.
- The Volunteer.gov.sg scheduled importer and manual imported-card override workflow are retired from runtime code.
- There is no current KELUARGA-to-YM Hub handoff. MakLom is the current downstream reporting/volunteer-management handoff through manual event-report upload.

FAQ content note:

- The FAQ feature shell is implemented, but Volunteer Management has not yet furnished the production questions and answers.

### Event Guides

Implemented:

- Event Guide listing and event detail pages.
- Event date/time and venue display.
- Directions links.
- Briefing links.
- Operational instructions.
- Programme rundown URL and image gallery support.
- Shift/timeslot information.
- Volunteer-facing sign-in/sign-out controls where enabled.
- Event-guide access controls backed by database rules.

Operational note:

- Event Guides may include operational links such as WhatsApp or briefing content. Their public-access policy should continue to be reviewed before broad rollout.

### Volunteer authentication and personal account

Implemented:

- Supabase authentication.
- Passwordless volunteer email sign-in.
- Staff password setup and password-change flows.
- Password recovery that correctly enters a reset flow rather than silently redirecting to the dashboard.
- Separate app account identity, stable KELUARGA volunteer identity and optional YM Hub reconciliation identity.
- Verified email signup can provision a native KELUARGA volunteer profile without a YM Hub record.
- Immutable human-readable `KELxxxxx` volunteer IDs are generated for native volunteer profiles.
- Account-status handling including pending-link, active, suspended and closed states.
- Volunteer dashboard protected by authentication.
- Volunteers can edit their app-owned display name and mobile number through an audited self-service profile form; login email, KELUARGA ID and backend identifiers remain protected.

Important boundary:

- KELUARGA is the active volunteer-facing and operational system. Existing YM Hub account/reconciliation foundations are dormant and are not part of the current volunteer workflow.

### Volunteer dashboard

Implemented UI/read path:

- Volunteer account dashboard.
- KELUARGA volunteer ID display.
- KELUARGA registration status and recent registration notifications.
- Profile-linking state.
- YM Hub sync-state display.
- Imported YM Hub registration snapshots remain as a legacy/backend reconciliation view.
- Imported attendance snapshots.
- Verified volunteer-hours display derived from authoritative snapshots.
- Separately labelled app-owned KELUARGA contribution-hour display for integrated manual Event Operations records.
- Stale/failed/unavailable sync handling in the read model.

Current direction:

- Volunteer-facing personalisation should rely on KELUARGA-owned data. Legacy YM Hub linkage/sync surfaces should be removed or hidden in the next cleanup slice.

### Points and gamification

Implemented foundation and volunteer UI:

- Points page.
- Versioned point rules.
- Flat-points and points-per-hour calculation methods.
- Append-only point ledger.
- Award, adjustment and reversal entries.
- Reconciliation from verified YM Hub attendance snapshots.
- Personal points balance and history read model with explicit source provenance.
- Role-gated staff points management at `/admin/points` for audited manual recognition awards.
- Manual recognition awards are idempotent, append-only and distinct from YM Hub attendance-derived points.
- Tests covering the gamification foundation, reconciliation model and manual recognition workflow.
- Staff-defined badge catalogue and audited badge award/revocation workflow.
- Volunteer profile summary of active badges.

Policy/integration dependency:

- Operational roster attendance does not currently award points.
- Attendance-derived points remain disabled until Volunteer Management approves a trusted attendance/hour rule under the KELUARGA + MakLom operating model.
- Manual staff-recognition points require an authorised gamification manager/admin and an explicit reason.
- A production attendance point rule must be explicitly approved and activated.

### Volunteer pathways

Implemented:

- Explorer starting point.
- Four colour-coded pathway tracks.
- Ordered pathway phases/stages.
- Volunteer skill-tree style display.
- Staff-managed pathway versions.
- Draft, preview and publish workflow.
- Immutable published versions.
- Role-gated pathway administration.

Implemented personal positioning:

- Staff-managed volunteer pathway positions.
- One active position per pathway track with retained history.
- Volunteer-facing pathway map highlights confirmed positions.
- My Profile shows current pathway status.

Not yet implemented:

- Automatic stage advancement.

## 2. Staff content and administration

### Content management

Implemented:

- Role-gated admin content area.
- Canonical programme/event creation and editing, including public opportunity presentation fields.
- News creation/editing.
- Separate public opportunity and Event Guide publication controls.
- Revision/history foundation for retained CMS content.

### Staff accounts and access

Implemented:

- Role-backed staff access controls.
- Staff access-management page.
- Staff setup-link generation.
- Event-manager, content-manager and pathway-manager authorization helpers.
- Server-side authorization checks for privileged actions.

### Event administration

Implemented:

- Staff Event Operations area at `/admin/events`.
- Quick Event Operations workflow for manual or last-minute events that do not need a public opportunity.
- Event creation/editing.
- Multi-day/multi-shift support through event timeslots.
- Shift editing and optional per-shift registration capacity.
- Staff registration review at `/admin/registrations` with Confirm, Waitlist and Reject actions.
- Programme rundown management.
- Programme rundown image support.
- Current/upcoming event list.
- Past Events page for older events with search/filter/sort.
- Compact mobile-oriented event admin UI.

### Roster management

Implemented:

- CSV roster upload.
- Manual-event imports have an explicit `event only` or `volunteer database` integration mode.
- Integrated manual imports match by KELUARGA Volunteer ID, email or mobile and can create a new `KELxxxxx` volunteer when no unambiguous match exists.
- Isolated manual imports do not create or modify main volunteer records.
- Pasted roster data from Excel/Sheets/CSV text.
- Roster template export.
- Optional Volunteer ID.
- Duplicate/match safeguards using available identifiers.
- Shift assignment.
- Walk-in/last-minute volunteer creation.
- Walk-ins for integrated manual events follow the same strong-identifier matching/new-volunteer rules; isolated-event walk-ins remain event-only.
- Dietary requirements.
- T-shirt size and contact details.
- Entry-method tracking so walk-ins, imports and KELUARGA-confirmed registrations remain distinguishable.
- Confirmed KELUARGA registrations create/reconcile roster assignments without staff re-keying.
- Roster rows generated from registration retain the stable KELUARGA registration ID.
- Walk-in name/email/mobile corrections.
- Cross-shift correction propagation for the same walk-in event identity.

Identity rule:

- Walk-in detail corrections preserve the same `attendance_person_key`, so attendance, insights and reviews remain attached to the same operational person identity.

## 3. Attendance and event-day operations

### Staff attendance controls

Implemented:

- Staff check-in.
- Staff check-out.
- Audited timestamp corrections.
- Withdrawn status.
- Absent status.
- Undo non-attendance status.
- Bulk checkout for currently checked-in volunteers in a shift.
- Attendance export.
- Formula-neutralised CSV output.
- Database-backed attendance transition integrity.

### Continuous attendance across shifts

Implemented:

- Stable person identity across multiple shifts in one event.
- Continuous AM-to-PM attendance handling.
- Continuation records so a volunteer can remain checked in across adjacent shifts.
- Early checkout handling.
- Effective attendance view for shift and event reporting.
- Support for a volunteer choosing to stay into a later shift.
- Regression tests for continuous-shift attendance.

### Live monitoring and reconciliation

Implemented:

- Live attendance monitor.
- Automatic refresh component.
- Attendance exception detection.
- Reconciliation view.
- Staff-facing identification of incomplete or anomalous attendance states.

Important boundary:

- These records are KELUARGA operational evidence. App-owned contribution hours must remain clearly labelled until Volunteer Management defines the verification policy and downstream MakLom treatment.

### QR attendance and feedback

Implemented foundation and routes:

- Staff QR attendance presenter.
- Volunteer attendance scan flow.
- Completion flow.
- Event feedback flow.
- Event feedback schema and tests.
- Staff event reporting includes feedback data.

### Attendance security and integrity

Implemented:

- PIN-related attendance controls where configured.
- PIN-attempt tracking.
- Immutable/auditable attendance change records.
- Server-side state-transition validation.
- Roster conflict guards.
- Service-role-only privileged roster access where required.
- RLS/database regression tests.

## 4. Volunteer management intelligence

### Volunteer Insights

Implemented:

- Event-level volunteer insight capture.
- Inline `Add insight` flow from staff roster cards.
- Categories:
  - skill
  - interest
  - experience
  - connection
  - role preference
  - availability
  - language
  - development
  - follow-up
  - note
- Source distinction:
  - volunteer shared
  - staff observed
- Review states:
  - submitted
  - accepted
  - dismissed
- Staff review/accept/dismiss workflow.
- Insight export for downstream/manual analysis.
- RLS/service-role protections.

Deferred by product decision:

- No automatic MakLom handoff.
- Accepted insight does not directly mutate a canonical central volunteer profile.

### Volunteer Reviews

Implemented:

- Event-level staff review of a volunteer.
- 1–5 role-performance rating.
- Positive behaviour tags.
- Concern behaviour tags.
- Optional staff comment.
- Follow-up-required flag.
- Multiple staff can review the same volunteer.
- One review per reviewer/event/person enforced by uniqueness rules.
- Review aggregation shown within Volunteer Insights.
- Event report export includes reviews.

Design rule:

- Reviews remain separate structured records; they are not automatically promoted into permanent volunteer-profile facts.

### Event reporting / impact data export

Implemented:

- Event report export combining:
  - event and shift details
  - roster identity/contact fields
  - attendance state
  - continuous-attendance fields
  - dietary details
  - volunteer insights
  - volunteer reviews
  - volunteer feedback

Current limitation:

- This is a rich event-level export rather than a complete cross-event impact analytics dashboard.
- App-owned contribution hours from integrated manual events are not YM Hub verified hours and must remain distinguishable in downstream reporting.

## 5. Integrations

### Volunteer.gov.sg

Retired runtime integration:

- The scheduled importer, Vercel Cron route, parser and imported-card override editor are removed from the active application.
- Existing imported rows remain temporarily as historical provenance only and are not used for opportunity discovery or event operations.

### YM Hub / Salesforce

Dormant foundation:

- `ymhub` projection schema and snapshot tables remain in the repository/database.
- No KELUARGA-to-YM Hub batch or API handoff is planned in the current roadmap.
- These structures are retained only for possible future reuse and must not be treated as a current product dependency.
- Volunteer-facing flows should not imply that YM Hub linking or synchronisation is required.

### MakLom

Current state:

- Event reports are exported from KELUARGA and manually uploaded to MakLom where required.
- Volunteer Insights/reviews can be included in controlled downstream reporting.
- No automatic server-to-server integration is currently planned.
- A future reviewed inbox/handoff model remains optional and would require a separate design review.

## 6. Platform, security and release engineering

Implemented:

- Next.js application hosted on Vercel.
- Supabase database/auth backend.
- Forward-only migrations.
- pgTAP database and RLS tests.
- Vitest application tests.
- Lint, type-check, production build and dependency-audit commands.
- GitHub Actions CI.
- Production-readiness check script.
- Environment validation.
- CSP/security header helpers.
- Redirect safety helpers.
- CSV injection protection.
- Service-role/server-only privileged operations.
- Production handover/runbook documentation.

Release model:

- `main` is the production branch.
- Short-lived branches and pull requests are the intended development workflow.
- Vercel previews are used for review before production merge.

## 7. Current product boundary summary

KELUARGA's target model has four distinct responsibilities:

1. **Recruitment and engagement** — pathways, recruitment intake, discovery and personal account surfaces.
2. **Registration** — app-owned registrations, waitlists/cancellations and shift selections.
3. **Event operations** — rosters, shifts, walk-ins, attendance, reviews, insights, feedback and reporting.
4. **Downstream reporting** — current manual event-report handoff to MakLom; YM Hub projections are dormant future infrastructure.

The first-class KELUARGA recruitment intake, registration lifecycle and registration-to-roster handoff are implemented. Manual/last-minute Event Operations can be intentionally isolated or integrated with the volunteer database. Operational attendance and app-owned contribution credits must remain clearly labelled until the organisation defines which records count as verified hours.
