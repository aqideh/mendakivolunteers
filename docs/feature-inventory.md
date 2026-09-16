# Feature inventory

**Snapshot date:** 16 September 2026  
**Reference branch:** `main`  
**Reference commit at start of review:** `aacb313211268bd76c7de6d2b3c35939c9317b90`

This file records implemented capability, not aspirational scope. A feature is listed as implemented when the current application or production migrations contain the relevant routes, actions, schema and tests.

## 1. Public volunteer experience

### Landing and discovery

Implemented:

- Branded KELUARGA landing page.
- Public opportunity browsing and opportunity detail pages.
- Public news listing and news detail pages.
- Public volunteer pathways page.
- External registration link-outs rather than app-owned registration state.
- Configurable registration destination.

Current boundary:

- Registration remains authoritative outside KELUARGA.
- KELUARGA must not present itself as the final source of registration status until YM Hub data has been imported and reconciled.

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
- Separate app account identity, internal volunteer identity and YM Hub identity.
- Account-status handling including pending-link, active, suspended and closed states.
- Volunteer dashboard protected by authentication.

Important boundary:

- KELUARGA and YM Hub remain separate accounts/sessions during the current batch-integration phase.

### Volunteer dashboard

Implemented UI/read path:

- Volunteer account dashboard.
- Profile-linking state.
- YM Hub sync-state display.
- Imported registration snapshots.
- Imported attendance snapshots.
- Verified volunteer-hours display derived from authoritative snapshots.
- Stale/failed/unavailable sync handling in the read model.

Deployment dependency:

- The dashboard only becomes meaningfully personalised when production YM Hub projections are populated reliably.

### Points and gamification

Implemented foundation and volunteer UI:

- Points page.
- Versioned point rules.
- Flat-points and points-per-hour calculation methods.
- Append-only point ledger.
- Award, adjustment and reversal entries.
- Reconciliation from verified YM Hub attendance snapshots.
- Personal points balance and history read model.
- Tests covering the gamification foundation and reconciliation model.

Policy/integration dependency:

- Operational roster attendance does not award points.
- Points are only generated from verified authoritative YM Hub records.
- A production point rule must be explicitly approved and activated.

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

Not yet implemented:

- Individual volunteer positioning on a specific pathway stage.
- Automatic stage advancement.

## 2. Staff content and administration

### Content management

Implemented:

- Role-gated admin content area.
- Opportunity creation/editing.
- News creation/editing.
- Publication-state controls.
- Revision/history foundation in the CMS schema.
- Validation of registration URLs and physical-opportunity location rules.

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
- Event creation/editing.
- Multi-day/multi-shift support through event timeslots.
- Shift editing.
- Programme rundown management.
- Programme rundown image support.
- Current/upcoming event list.
- Past Events page for older events with search/filter/sort.
- Compact mobile-oriented event admin UI.

### Roster management

Implemented:

- CSV roster upload.
- Pasted roster data from Excel/Sheets/CSV text.
- Roster template export.
- Optional Volunteer ID.
- Duplicate/match safeguards using available identifiers.
- Shift assignment.
- Walk-in/last-minute volunteer creation.
- Dietary requirements.
- T-shirt size and contact details.
- Entry-method tracking so walk-ins can be distinguished from imported roster rows.
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

- These records are KELUARGA operational evidence. YM Hub remains the authoritative source of official attendance and verified hours after reconciliation/import.

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

## 5. Integrations

### Volunteer.gov.sg

Implemented:

- Scheduled opportunity import foundation.
- Vercel Cron route.
- Parsing/validation tests.

Direction:

- This source is transitional and should be replaced or de-emphasised as the official registration/opportunity flow moves to YM Hub-approved sources.

### YM Hub / Salesforce

Implemented foundation:

- `ymhub` projection schema.
- Registration snapshots.
- Attendance snapshots.
- Volunteer sync state.
- Volunteer dashboard read path.
- Gamification reconciliation contract.
- Documentation of requested YM Hub source fields.

Current integration direction:

- Controlled batch-file processing is the immediate integration approach.
- A future server-only API adapter should populate the same canonical projection model when DTI approves it.
- Direct production Salesforce synchronization is not currently enabled.

### MakLom

Current state:

- No automatic integration.
- Volunteer Insights can be exported for manual downstream use.
- A future reviewed inbox/handoff model has been discussed but intentionally deferred.

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

KELUARGA currently does three different jobs and the distinction should remain explicit:

1. **Volunteer companion** — discovery, news, Event Guides, pathways and personal account surfaces.
2. **Staff event-operations system** — rosters, shifts, walk-ins, attendance, reviews, insights, feedback and reporting.
3. **Read-only projection of official volunteer records** — registrations, official attendance and verified hours imported from YM Hub.

The third category must remain read-only and authoritative downstream. KELUARGA should not silently substitute operational attendance for verified YM Hub records.
