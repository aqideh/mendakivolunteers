# Feature inventory

**Snapshot date:** 24 September 2026  
**Reference branch:** `staging`  
**Reference commit at start of review:** `aacb313211268bd76c7de6d2b3c35939c9317b90`

This file records implemented capability, not aspirational scope. A feature is listed as implemented when the current application or production migrations contain the relevant routes, actions, schema and tests.

## 1. Public volunteer experience

### Landing and discovery

Implemented:

- Branded KELUARGA landing page.
- Public opportunity browsing and opportunity detail pages.
- Prospective-volunteer intake is handled through the approved FormSG recruitment form.
- The former in-app KELUARGA recruitment application/review workflow is retired; historical database records are retained for provenance only.
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
- KELUARGA and MakLom share one canonical `core.volunteers` person identity. YM Hub is dormant future integration infrastructure rather than a current runtime dependency.

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
- Separate app account identity plus one stable shared `core.volunteers` identity used across KELUARGA and MakLom.
- Verified email signup can provision a native KELUARGA volunteer profile without a YM Hub record.
- Immutable human-readable `KELxxxxx` volunteer IDs are generated for native volunteer profiles.
- Account-status handling including pending-link, active, suspended and closed states.
- Volunteer dashboard protected by authentication.
- Volunteers can edit their app-owned display name and mobile number through an audited self-service profile form; login email, KELUARGA ID and backend identifiers remain protected.

Important boundary:

- KELUARGA authorization and MakLom authorization remain separate even though the applications share Supabase Auth and the canonical volunteer UUID.

### Volunteer dashboard

Implemented UI/read path:

- Volunteer account dashboard.
- KELUARGA volunteer ID display.
- KELUARGA registration status and recent registration notifications.
- Shared canonical volunteer-profile state.
- Approved contribution-hours display derived only from MakLom-approved contribution records.
- Audited self-service display-name/mobile editing.
- No live YM Hub projection or sync-state dependency.

Deployment dependency:

- Approved hours require the MakLom contribution review workflow to be operated.

### Points and gamification

Implemented foundation and volunteer UI:

- Points page.
- Versioned point rules.
- Flat-points and points-per-hour calculation methods.
- Append-only point ledger.
- Award, adjustment and reversal entries.
- Historical YM Hub reconciliation infrastructure is retained but is dormant in the current operating model.
- Personal points balance and history read model with explicit source provenance.
- Role-gated staff points management at `/admin/points` for audited manual recognition awards.
- Manual recognition awards are idempotent and append-only; attendance-derived automation is currently paused.
- Tests covering the gamification foundation, reconciliation model and manual recognition workflow.
- Staff-defined badge catalogue and audited badge award/revocation workflow.
- Volunteer profile summary of active badges.

Policy/integration dependency:

- Operational roster attendance does not award points automatically.
- Attendance-derived automation remains paused until a rule is approved against MakLom-approved contribution records.
- Manual staff-recognition points require an authorised staff role and an explicit reason.
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

- These records are KELUARGA operational evidence. Completed sessions become contribution candidates and only MakLom-approved records count as approved volunteer hours in the current operating model.

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

Shared-data boundary:

- Accepted insights can enter the MakLom review inbox with event/source provenance.
- Accepted insight does not directly mutate a permanent volunteer-profile fact.

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

Implemented foundation:

- `ymhub` projection schema.
- Registration snapshots retained for backend reconciliation/legacy compatibility.
- Attendance snapshots.
- Volunteer sync state.
- Volunteer dashboard read path.
- Gamification reconciliation contract.
- Documentation of requested YM Hub source fields.

Current integration direction:

- Volunteer Management will define the KELUARGA -> YM Hub backend handoff separately.
- Controlled batch processing remains the practical immediate mechanism where needed.
- A future server-only API adapter may replace or supplement batch handoff when DTI approves it.
- Direct production Salesforce synchronization is not currently enabled.

### MakLom

Current state:

- MakLom owns the prospective-volunteer lead pipeline for FormSG recruitment responses.
- Leads remain separate from canonical volunteer records until staff explicitly accept and convert them.
- Conversion performs duplicate matching before creating a volunteer record.
- Volunteer Insights remain separate structured records and are not automatically promoted into MakLom volunteer facts.

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

1. **Engagement and discovery** — pathways, opportunity discovery and personal account surfaces. Prospective-volunteer lead intake is handled through FormSG and reviewed in MakLom.
2. **Registration** — app-owned registrations, waitlists/cancellations and shift selections.
3. **Event operations** — rosters, shifts, walk-ins, attendance, reviews, insights, feedback and reporting.
4. **Backend reconciliation** — read-only YM Hub projections for organisational record matching, verified attendance and verified hours.

The KELUARGA registration lifecycle and registration-to-roster handoff are implemented. Prospective-volunteer recruitment intake has moved to FormSG, with lead tracking owned by MakLom. Manual/last-minute Event Operations can be intentionally isolated or integrated with the volunteer database. Operational attendance and app-owned contribution credits must still not be silently substituted for verified YM Hub hours.
