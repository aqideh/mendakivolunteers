# Recruitment, registration and event-operations operating model

**Decision date:** 22 September 2026  
**Status:** Approved target operating model; implementation in progress

## 1. Decision

KELUARGA is the volunteer-facing system for recruitment and registration.

Volunteers should discover opportunities, enter the recruitment journey, register for opportunities and manage their participation through KELUARGA. Volunteer managers should use KELUARGA registration data to prepare event rosters and run event-day operations.

There is no current KELUARGA-to-YM Hub handoff requirement. KELUARGA remains the operational system for recruitment, registration and Event Operations.

MakLom is the current downstream volunteer-management/reporting handoff. Event Operations reports should continue to be exported from KELUARGA and uploaded to MakLom manually until a separately reviewed automation project is approved.

## 2. Source-of-record boundary

The phrase "source of truth" needs to be scoped by workflow.

| Data / workflow | Operational owner | Current downstream treatment |
|---|---|---|
| Volunteer recruitment journey | KELUARGA | KELUARGA; include in MakLom handoff where required |
| KELUARGA account | KELUARGA / Supabase Auth | KELUARGA |
| App volunteer identity | KELUARGA | Stable `KELxxxxx` identity; map downstream explicitly where needed |
| Opportunity registration | KELUARGA | KELUARGA |
| Waitlist / cancellation / withdrawal before event | KELUARGA | KELUARGA |
| Event roster and shift assignment | KELUARGA | KELUARGA; event report may be uploaded to MakLom |
| Event-day check-in/check-out | KELUARGA | KELUARGA operational record; included in MakLom reporting where required |
| Volunteer hours | KELUARGA operational evidence / policy-defined verification | Do not label app-owned contribution hours as verified until the verification policy is defined |
| KELUARGA points and badges | KELUARGA | KELUARGA |
| Event report / operational outcomes | KELUARGA | Manual upload to MakLom where applicable |

KELUARGA is the system of engagement and the live operational source for recruitment, registration and event operations. MakLom is the current downstream reporting/volunteer-management handoff; YM Hub is not part of the active workflow.

## 3. End-to-end volunteer procedure

### 3.1 Recruitment

```text
Volunteer discovers KELUARGA
        ->
chooses a volunteering pathway / opportunity
        ->
creates or uses a KELUARGA account
        ->
submits recruitment information
        ->
Volunteer Management reviews / follows up
        ->
volunteer becomes eligible for relevant opportunities
```

Recruitment data must be stored in KELUARGA with an auditable status history. A volunteer may legitimately exist in KELUARGA before a YM Hub record has been created.

### 3.2 Registration

```text
Eligible volunteer
        ->
opens opportunity in KELUARGA
        ->
selects available event / shift where applicable
        ->
submits registration
        ->
KELUARGA records registered / waitlisted / withdrawn / cancelled state
        ->
volunteer sees the current KELUARGA status immediately
```

Registration is no longer a link-out to YM Hub or another portal as the intended end state.

Capacity and waitlist rules must be enforced transactionally in KELUARGA rather than inferred from display copy.

### 3.3 Registration to event operations

Confirmed registrations should populate event operations directly from the KELUARGA database.

```text
KELUARGA registration
        ->
confirmed event / shift assignment
        ->
event roster entry
        ->
Event Guide / briefing access
        ->
check-in / check-out / absent / withdrawn / walk-in handling
        ->
event report
```

This should be a database-backed handoff, not a staff CSV copy between two KELUARGA features.

The handoff must be idempotent: re-running it must not create duplicate roster rows. A roster row created from a registration should retain a stable reference to that registration. Walk-ins remain supported and can have no pre-event registration reference.

Waitlisted registrations must not become active roster rows until promoted. A cancellation or withdrawal should update the linked operational state rather than silently deleting history.

### 3.4 Manual / last-minute Event Operations exception

Normal KELUARGA registrations must continue to flow directly into Event Operations through the database. CSV is **not** the normal registration-to-roster handoff.

For a manual or last-minute event that needs Event Operations without first creating a public opportunity, authorised staff can create a Quick Event Operations record and choose one data boundary before importing the roster:

```text
Manual event
    -> isolated
       -> event roster + attendance only
       -> no core volunteer creation
       -> no KELUARGA contribution-hour credit

    -> integrated
       -> match existing KEL volunteer by KEL ID / email / mobile
       -> or create new KELxxxxx volunteer from a reliable identifier
       -> event roster + attendance
       -> optional KELUARGA contribution-hour credit
```

An isolated event still needs a persisted Event Operations record so roster, attendance, audit and reporting functions work, but it is marked `manual_isolated` and must not silently become a canonical volunteer/programme record.

An integrated event is marked `manual_integrated`. Name-only matching is not permitted for database integration. Each volunteer must have an existing KELUARGA Volunteer ID, email address or mobile number. New volunteer records created through this route do not automatically receive a login account.

If contribution-hour crediting is enabled, hours are derived from completed Event Operations attendance sessions and stored as **KELUARGA app-owned contribution credits**. These records are intentionally separate from YM Hub verified attendance and verified hours.

Manual-event walk-ins follow the same event data boundary. Staff can reconcile contribution credits after check-out or attendance corrections so corrected operational attendance is reflected without changing YM Hub verified-hour records.

### 3.5 Event operations to MakLom

For the current operating model:

```text
KELUARGA event operations
        ->
attendance / reviews / insights / event report
        ->
approved export
        ->
manual upload to MakLom
```

The existing report-upload procedure can remain in place. Automatic KELUARGA -> MakLom synchronization is not part of this decision and should not be introduced without a separately reviewed matching, provenance and error-handling design.

### 3.6 YM Hub / Salesforce

There is no active KELUARGA-to-YM Hub or Salesforce handoff in the current operating model.

Existing projection tables, source-ID fields and integration code may remain in place as dormant infrastructure, but:

- volunteer registration must not depend on them;
- Event Operations must not depend on them;
- staff should not be asked to complete a YM Hub export as part of the current workflow;
- volunteer-facing pages should not imply that YM Hub linking/synchronisation is required;
- new integration work should only resume if a future operating-model decision explicitly requires it.

## 4. Required data-model changes

### 4.0 Canonical programme/event record

KELUARGA uses `public.phaseone_events` as the canonical programme/event record for the community-volunteer workflow. The historical `phaseone` name is retained to avoid a disruptive production rename.

A staff-created record owns:

- public opportunity title/summary/description/category/image/eligibility;
- public opportunity publication state and registration deadline;
- event schedule/timeslots and venue;
- Event Guide publication and operational instructions;
- Event Operations roster and attendance relationships.

The Volunteer.gov.sg importer and imported-card override model are retired from runtime use. Historical imported rows may remain temporarily for provenance but are not a source or fallback for public opportunities.


The current foundation assumed that every `core.volunteers` row was a projection of an existing YM Hub volunteer and therefore required `ymhub_volunteer_id`. That assumption no longer holds.

### 4.1 Volunteer identity

Target invariant:

```text
Supabase Auth user
        ->
KELUARGA volunteer UUID
        ->
optional YM Hub external ID after backend handoff
```

Required change:

- `core.volunteers.id` remains the stable KELUARGA volunteer key.
- `core.volunteers.ymhub_volunteer_id` must become nullable and unique when present.
- creation of a KELUARGA volunteer must not require an existing YM Hub record;
- backend reconciliation may attach or correct the YM Hub ID through an audited staff/integration process;
- email may assist matching but must not be the sole permanent cross-system identifier.

### 4.2 Recruitment records

Add an app-owned recruitment domain capable of storing at minimum:

- volunteer;
- submitted-at timestamp;
- pathway / role interests;
- required recruitment form responses;
- consent / acknowledgement timestamps where required;
- lifecycle status;
- staff review outcome;
- review history / audit metadata.

The exact questionnaire fields may evolve without changing the volunteer's stable identity.

### 4.3 Opportunity registrations

Add a first-class registration domain capable of storing at minimum:

- registration ID;
- volunteer ID;
- opportunity / event ID;
- selected shift(s) where applicable;
- registration status;
- registration timestamp;
- status-change timestamps;
- cancellation / withdrawal metadata;
- waitlist position or ordering where used;
- source / referral metadata where required;
- optional YM Hub registration / assignment ID after handoff;
- backend sync/reconciliation state.

Statuses must be explicit and validated. Do not infer registration state from the existence of a roster row.

### 4.4 Registration-to-roster linkage

The event-operations roster must be able to reference the KELUARGA registration that produced it.

A suitable target relationship is:

```text
registration
   1
   |
   +---- 0..many shift selections / assignments
                     |
                     +---- roster rows
                               |
                               +---- attendance sessions
```

A volunteer can register for multiple valid shifts. Existing adjacent-shift attendance behaviour remains applicable.

Walk-ins are the explicit exception: they can enter the roster without a pre-event registration and should be marked as such for later reconciliation.

## 5. Operational consequences

### For volunteers

- One volunteer-facing registration journey in KELUARGA.
- Registration status can be shown immediately after submission.
- No separate YM Hub sign-in should be required for ordinary recruitment or event registration.
- Event Guides, registration status and event participation can use the same KELUARGA identity.

### For Volunteer Management

- Recruitment and registration lists become directly usable for deployment planning.
- Accepted registrations can become rosters without re-keying the same volunteer data.
- Capacity, waitlist, cancellations and shift changes can be managed before event day.
- Backend YM Hub handoff becomes an administrative integration process rather than a volunteer-facing step.
- Event reporting to MakLom continues from the existing event-operations output until changed separately.

### For the system

- KELUARGA stores more personal and operational data and therefore requires stronger production backup, access control, audit and recovery arrangements.
- Supabase becomes more operationally critical because it stores volunteer recruitment, registration and roster data.
- Vercel remains critical because KELUARGA is the volunteer-facing transaction channel.
- GitHub change controls become more important because application and database migrations can directly affect registration and event operations.

## 6. Transition from the previous model

The previous model assumed:

```text
KELUARGA discovery -> external registration portal -> YM Hub registration snapshot -> KELUARGA display
```

That model is superseded.

The target model is:

```text
KELUARGA recruitment
        ->
KELUARGA registration
        ->
KELUARGA event roster
        ->
KELUARGA event operations
        ->
KELUARGA event report export
        ->
manual MakLom upload
```

Existing `ymhub.registration_snapshots` and batch-integration code should not be deleted casually. They may still be useful for reconciliation and for displaying backend handoff results, but they must no longer be treated as the source of the volunteer-facing registration workflow.

Existing external-registration URL fields and configuration are transitional and should be retired only when the in-app registration flow is complete and tested.

Applied migration files are historical records and must not be rewritten merely to change comments. New migrations should change live schema assumptions.

For this release, the repository migration versions are aligned with the versions recorded by the production Supabase migration history before merge. The final cleanup migration removes the temporary legacy opportunity RPC only after the new KELUARGA opportunity code is deployed.

## 7. Implementation sequence

1. Change the KELUARGA volunteer identity model so a volunteer can exist without a YM Hub ID. **Implemented.**
2. Use the KELUARGA programme/event record as the canonical opportunity + Event Guide + Event Operations source. **Implemented in Slice 2.**
3. Add first-class opportunity/event registration, cancellation, withdrawal and waitlist records. **Implemented.**
4. Add shift selection and capacity enforcement. **Implemented.**
5. Add the idempotent registration-to-roster handoff. **Implemented.**
6. Update volunteer pages to use KELUARGA registration status rather than YM Hub registration snapshots. **Implemented.**
7. Retire external registration link-outs once the in-app flow is production-ready. **Implemented.**
8. Keep the existing event-report export and manual MakLom upload as the current downstream handoff.
9. Remove/hide volunteer-facing YM Hub sync/link states that no longer belong to the active operating model.
10. Update gamification inputs only after the trusted attendance/eligibility policy under the KELUARGA + MakLom model is agreed.

## 8. Guardrails

- Do not require a YM Hub record before allowing KELUARGA recruitment or registration.
- Do not create duplicate volunteer identities when a later YM Hub record is attached.
- Do not populate event rosters through manual re-keying when a confirmed KELUARGA registration already exists.
- Use manual CSV roster ingestion only for the explicit manual/last-minute Event Operations exception, with an isolated or integrated scope selected before import.
- Do not use name-only matching to promote a manual roster person into the main KELUARGA volunteer database.
- Do not describe app-owned manual-event contribution credits as YM Hub verified hours.
- Do not treat a waitlist entry as an active deployment.
- Do not delete registration or attendance history to represent cancellation or correction.
- Dormant YM Hub imports/projections must not overwrite newer KELUARGA operational state.
- Do not make any external handoff a prerequisite for event-day operations.
- Keep all privileged mutations server-side with RLS, role checks and audit events.
- Keep the current MakLom handoff manual until a separately approved integration is designed.
- Preserve stable IDs and reconciliation metadata for all downstream handoffs.
