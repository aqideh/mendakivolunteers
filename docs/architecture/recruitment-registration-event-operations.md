# Recruitment, registration and event-operations operating model

**Decision date:** 22 September 2026  
**Status:** Approved target operating model; implementation in progress

## 1. Decision

KELUARGA is the volunteer-facing system for recruitment and registration.

Volunteers should discover opportunities, enter the recruitment journey, register for opportunities and manage their participation through KELUARGA. Volunteer managers should use KELUARGA registration data to prepare event rosters and run event-day operations.

YM Hub remains MENDAKI's authoritative organisational source of record on the backend. The operational handoff from KELUARGA to YM Hub will be designed separately by Volunteer Management with the relevant system owners. That backend handoff must not require volunteers to leave KELUARGA to register.

MakLom remains a downstream volunteer-management and reporting destination. The current event-operations report can continue to be exported from KELUARGA and uploaded to MakLom until a separately reviewed integration is introduced.

## 2. Source-of-record boundary

The phrase "source of truth" needs to be scoped by workflow.

| Data / workflow | Operational owner | Organisational authoritative record |
|---|---|---|
| Volunteer recruitment journey | KELUARGA | YM Hub after approved backend handoff |
| KELUARGA account | KELUARGA / Supabase Auth | KELUARGA |
| App volunteer identity | KELUARGA | Linked to YM Hub when a backend record exists |
| Opportunity registration | KELUARGA | YM Hub after handoff/reconciliation |
| Waitlist / cancellation / withdrawal before event | KELUARGA | YM Hub after handoff/reconciliation |
| Event roster and shift assignment | KELUARGA | YM Hub after handoff where required |
| Event-day check-in/check-out | KELUARGA operational record | YM Hub after attendance handoff and verification |
| Verified volunteer hours | YM Hub | YM Hub |
| KELUARGA points and badges | KELUARGA | KELUARGA, using approved eligibility inputs |
| Event report / operational outcomes | KELUARGA | MakLom after current manual report upload, where applicable |

KELUARGA therefore becomes the system of engagement and the live operational source for recruitment, registration and event operations. YM Hub remains the backend master record rather than the public registration workflow.

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

### 3.4 Event operations to MakLom

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

### 3.5 KELUARGA to YM Hub backend handoff

Volunteer Management will define the detailed handoff separately.

KELUARGA must nevertheless be designed so that recruitment, volunteer, registration, assignment and attendance records can be exported or synchronized using stable identifiers and clear sync state.

The UI must not depend on the YM Hub handoff completing before a volunteer can register or before staff can operate an event.

When a corresponding YM Hub record exists, KELUARGA should retain the external YM Hub identifier for reconciliation. A failed or delayed backend handoff must be visible to staff as an integration state, not presented to volunteers as a failed KELUARGA registration.

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
        +---------------------> MakLom report upload
        |
        +---------------------> YM Hub backend handoff / reconciliation
```

Existing `ymhub.registration_snapshots` and batch-integration code should not be deleted casually. They may still be useful for reconciliation and for displaying backend handoff results, but they must no longer be treated as the source of the volunteer-facing registration workflow.

Existing external-registration URL fields and configuration are transitional and should be retired only when the in-app registration flow is complete and tested.

Applied migration files are historical records and must not be rewritten merely to change comments. New migrations should change live schema assumptions.

## 7. Implementation sequence

1. Change the KELUARGA volunteer identity model so a volunteer can exist without a YM Hub ID.
2. Use the KELUARGA programme/event record as the canonical opportunity + Event Guide + Event Operations source. **Implemented in Slice 2.**
3. Add first-class opportunity/event registration, cancellation and waitlist records.
4. Add shift selection and capacity enforcement.
5. Add the idempotent registration-to-roster handoff.
6. Update volunteer pages to use KELUARGA registration status rather than YM Hub registration snapshots.
7. Retire external registration link-outs once the in-app flow is production-ready.
8. Define the Volunteer Management backend export/sync procedure to YM Hub.
9. Keep the existing event-report export to MakLom; automate only through a separate reviewed project.
10. Update gamification inputs only after the authoritative attendance/eligibility policy is agreed.

## 8. Guardrails

- Do not require a YM Hub record before allowing KELUARGA recruitment or registration.
- Do not create duplicate volunteer identities when a later YM Hub record is attached.
- Do not populate event rosters through manual re-keying when a confirmed KELUARGA registration already exists.
- Do not treat a waitlist entry as an active deployment.
- Do not delete registration or attendance history to represent cancellation or correction.
- Do not let a stale YM Hub import overwrite a newer KELUARGA operational registration state.
- Do not make a successful backend handoff a prerequisite for event-day operations.
- Keep all privileged mutations server-side with RLS, role checks and audit events.
- Keep current MakLom handoff manual until a separately approved integration is designed.
- Preserve stable IDs and reconciliation metadata for all downstream handoffs.
