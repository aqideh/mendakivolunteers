# Launch readiness and backend integration direction

**Last reviewed:** 22 September 2026

This decision record supersedes the earlier model in which volunteers discovered opportunities in KELUARGA but registered through an external portal.

The current approved operating model is documented in detail at:

- [Recruitment, registration and event-operations operating model](../architecture/recruitment-registration-event-operations.md)
- [Current system architecture](../architecture/current-system.md)
- [Development roadmap](../development-roadmap.md)

## 1. Current operating direction

KELUARGA is the volunteer-facing channel for:

- recruitment;
- volunteer account/profile interaction;
- opportunity discovery;
- registration, waitlist, cancellation and withdrawal;
- shift selection where applicable;
- Event Guides;
- event rosters;
- event-day attendance operations;
- event reporting.

YM Hub remains MENDAKI's authoritative backend organisational record. Volunteer Management will define the detailed KELUARGA -> YM Hub data handoff separately with the relevant system owners.

MakLom remains a downstream volunteer-management/reporting destination. The current procedure is to generate the KELUARGA event-operations report and upload it manually to MakLom.

## 2. Important implementation status

The operating model above is approved, but the first-class KELUARGA recruitment/registration data model is not yet fully implemented.

The currently deployed application still contains transitional external registration link-outs and a YM Hub registration read model. These must not be mistaken for the target architecture.

The implementation work is tracked in GitHub issue #145.

## 3. Target volunteer journey

```text
Discover KELUARGA / choose pathway
        ->
create or use KELUARGA account
        ->
complete recruitment journey
        ->
browse opportunity
        ->
register in KELUARGA
        ->
registered / waitlisted / cancelled state shown immediately
        ->
confirmed registration populates event/shift roster
        ->
Event Guide and event preparation
        ->
KELUARGA event-day operations
        ->
event report
        +------------------> manual MakLom upload
        |
        +------------------> YM Hub backend handoff / reconciliation
```

A delayed or failed YM Hub handoff must not prevent a valid KELUARGA registration from appearing in event operations.

## 4. Identity direction

The stable application identity is the KELUARGA volunteer UUID.

```text
Supabase Auth user
        ->
KELUARGA volunteer UUID
        ->
optional YM Hub/Salesforce ID after reconciliation
```

A volunteer must be allowed to exist in KELUARGA before a YM Hub record is available. The current non-null YM Hub ID assumption therefore requires a forward database migration.

Email can assist matching but must not be treated as the permanent cross-system identity key.

## 5. Registration-to-roster direction

Confirmed KELUARGA registrations must feed event operations directly.

Requirements:

- stable registration ID;
- explicit registration status;
- shift selection;
- transactional capacity and waitlist enforcement;
- stable registration -> roster linkage;
- idempotent roster population;
- waitlist entries do not become active roster rows;
- cancellation/withdrawal changes operational state without deleting history;
- walk-ins remain explicit exceptions and may have no registration ID.

The registration-to-roster handoff must be database-backed rather than a manual CSV handoff between KELUARGA features.

## 6. Backend handoff to YM Hub

Volunteer Management will define the detailed procedure separately.

The KELUARGA data model must nevertheless make the handoff supportable by retaining:

- stable KELUARGA record IDs;
- optional external YM Hub/Salesforce IDs;
- created/updated timestamps;
- lifecycle/status history;
- export/sync state;
- batch/checksum metadata where files are used;
- exception and reconciliation status.

Controlled batch files remain a valid immediate mechanism. A later server-only API adapter may replace or supplement that mechanism after the relevant security and DTI approvals.

No Salesforce credential should ever be exposed to browser code.

## 7. Event Operations -> MakLom

The current manual process remains valid:

1. Complete roster and attendance operations in KELUARGA.
2. Reconcile incomplete check-ins/check-outs and walk-ins.
3. Generate the event report.
4. Review the report for completeness.
5. Upload the approved report into MakLom using the existing staff procedure.

Automatic KELUARGA -> MakLom synchronization remains deferred. If introduced later, it requires a separately reviewed identity-matching, provenance, retry and exception-handling design.

## 8. Read-only YM Hub projections

The existing `ymhub.*` schema remains useful for:

- backend reconciliation status;
- verified attendance;
- verified hours;
- displaying organisational-record results where appropriate;
- detecting stale/failed backend handoffs.

Existing registration snapshots may remain for transition/reconciliation but must no longer drive the volunteer-facing registration workflow once the KELUARGA registration domain is live.

## 9. Launch priorities

### P0 - architecture and data foundation

1. Make `core.volunteers.ymhub_volunteer_id` optional.
2. Add app-owned recruitment records.
3. Add app-owned registration/waitlist/cancellation records.
4. Add shift selection and capacity rules.
5. Add idempotent registration-to-roster handoff.
6. Apply RLS, role checks and audit logging to all new personal-data tables.
7. Update the volunteer dashboard to show KELUARGA registration state separately from backend verification.

### P1 - operating workflow

1. Define Volunteer Management's KELUARGA -> YM Hub handoff procedure.
2. Define export/sync exception handling and ownership.
3. Confirm event roster handoff rules for late cancellations, promoted waitlists and shift changes.
4. Confirm retention periods for recruitment and registration records.
5. Continue the current event-report -> MakLom procedure.

### P2 - integration hardening

1. Add batch history/checksum/retry controls where manual files are used.
2. Add staff reconciliation views for unmatched YM Hub records.
3. Add backend freshness/failure indicators.
4. Consider a server-only API adapter after security approval.
5. Consider MakLom automation only as a separate project.

## 10. Security and launch-readiness implications

KELUARGA will now hold substantially more volunteer personal and transactional data than under the previous discovery-only registration model.

Before broad rollout:

- production Supabase backup/recovery must be enabled and tested;
- Row Level Security must cover recruitment and registration data;
- administrative changes must be audited;
- Vercel secrets/environment configuration must remain server-only;
- GitHub production branch/change controls should prevent unreviewed schema/application changes;
- account recovery and staff access removal procedures must be documented;
- incident response must account for failed registrations, duplicate roster handoffs and data reconciliation failures.

## 11. Guardrails

- No volunteer-facing dependency on YM Hub registration.
- No requirement for a YM Hub ID before creating a KELUARGA volunteer.
- No stale YM Hub registration snapshot may overwrite newer KELUARGA registration state.
- No duplicate roster rows on handoff retry.
- No silent promotion from waitlist.
- No deletion of registration history to represent cancellations/corrections.
- No final verified hours calculated solely from KELUARGA timestamps.
- No service-role or Salesforce credentials in browser code.
- No automatic MakLom write-through until separately approved.
- Applied migration files remain historical; live changes use new forward migrations.
