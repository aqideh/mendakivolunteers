# Known issues, limitations and technical debt

**Last reviewed:** 23 September 2026  
**Reference branch:** `main`

This register deliberately separates confirmed defects from product limitations, integration dependencies and intentionally deferred work.

## Status summary

At the time of this review:

- the first-class KELUARGA registration workflow is implemented; broader recruitment intake and volunteer self-service cancellation/withdrawal remain follow-on work;
- a default-branch code search found **no explicit `TODO` or `FIXME` markers**;
- this does **not** mean the application is bug-free;
- newly confirmed reproducible defects should be opened as GitHub Issues and linked here when material or recurring.

## 1. Open limitations and dependencies

| Area | Status | Limitation / risk | Current handling | Next step |
|---|---|---|---|---|
| KELUARGA registration domain | Live foundation | Volunteers can sign up, receive a KEL ID, select shifts and submit registrations; staff can confirm, waitlist or reject, and confirmed registrations populate rosters transactionally. | Capacity is enforced at confirmation and registration status changes generate in-app notifications. | Add volunteer/staff cancellation and withdrawal flows with audited roster-state handling before relying on them operationally. |
| YM Hub backend reconciliation | Integration dependency | Verified attendance/hours and organisational backend reconciliation depend on a reliable KELUARGA -> YM Hub handoff. | Existing read models fail explicitly rather than fabricating verified records. | Define the Volunteer Management handoff process and build controlled reconciliation state. |
| YM Hub batch centre | Planned / may be narrowed | The repository has a projection/read-model foundation. Under the new model, inbound registration is no longer required for volunteer-facing operations, but controlled batch tooling may still be needed for backend reconciliation and verified records. | Integration work remains outside the volunteer-facing registration flow. | Scope batch tooling around the final Volunteer Management handoff procedure. |
| Attendance export to YM Hub | Planned hardening | KELUARGA operational attendance must still be mapped/reconciled into authoritative YM Hub attendance. | Event attendance can be exported; KELUARGA does not claim this is verified YM Hub attendance. | Add formal export-batch tracking, assignment matching and accepted/rejected reconciliation. |
| YM Hub authentication | Backend-only boundary | Ordinary volunteers should not need YM Hub sign-in for recruitment or registration. | KELUARGA uses its own Supabase Auth session. | Reassess SSO only if a future backend/use case actually requires it. |
| MakLom handoff | Intentionally deferred | Volunteer Insights are not automatically transferred to MakLom. | Accepted insights remain in KELUARGA and can be exported. | If reactivated, use a reviewed inbox/matching workflow rather than direct profile mutation. |
| Cross-event impact analytics | Planned feature | Event-level reports are rich, but there is not yet a complete longitudinal impact dashboard across events and volunteers. | Staff can export event attendance, insights, reviews and feedback. | Define agreed impact metrics, then build aggregate reporting without double counting multi-shift volunteers. |
| Gamification rollout | Policy/integration dependency | Manual points and badges are now available, while attendance-derived awards and automatic milestones still require approved rules plus verified YM Hub attendance. | Roster check-in cannot award points or badges; manual recognition is separately identified, staff-reviewed and audited. | Approve attendance rule values/effective dates, badge/milestone criteria and a staff-use policy before broad automation. |
| Volunteer.gov.sg import | Retired runtime integration | Historical imported rows remain for provenance, but opportunity discovery and programme operations no longer read from them. | Cron/import/parser and imported-card editing are removed from runtime. | Remove historical database objects only through a later deliberate cleanup migration if retention is no longer useful. |
| Event Guide sensitive links | Access-policy decision | Guides may contain briefing or WhatsApp links and other operational information. | Database-backed access controls exist, but the intended broad-launch policy must remain explicit. | Confirm which guide sections may be public versus assignment/code/signed-link gated. |
| `phaseone` naming | Technical debt, not a bug | Historic `phaseone` identifiers remain throughout routes, modules, tables and migrations. | Kept stable to avoid breaking deployed contracts. | Rename only through a planned API/database migration; do not perform cosmetic mass renames. |

## 2. Attendance and identity watch-points

These are high-risk regression areas because event-day data spans multiple shifts and several downstream features.

### Cross-shift identity continuity

A volunteer can appear in more than one shift and can remain checked in across adjacent shifts. The operational identity is represented by `attendance_person_key`.

Watch for regressions where:

- AM and PM rows become separate people after editing contact details;
- a walk-in correction updates only one shift;
- a review or insight becomes detached after an email/name correction;
- a later-shift extension creates duplicate attendance rather than a continuation;
- a final checkout does not close the effective attendance session.

The current implementation includes regression coverage for continuous attendance and cross-shift walk-in corrections.

### Operational identity is not canonical organisation identity

`attendance_person_key` exists to preserve event-level continuity. It must **not** be treated as:

- a Salesforce Person Account ID;
- the canonical `core.volunteers.id`;
- a MakLom volunteer ID;
- a permanent identifier to exchange between systems.

Future integration should map operational event records from the stable KELUARGA volunteer identity to the corresponding YM Hub backend record through controlled reconciliation.

### Official hours

KELUARGA timestamps can support reconciliation, but they must not silently become final verified volunteer hours. Official attendance and verified hours remain YM Hub-owned.

## 3. Reporting watch-points

### Multi-shift counting

A single person may have multiple roster rows for one event. Any aggregate metric must state whether it counts:

- unique volunteers;
- roster/deployment records;
- shifts;
- attendance sessions; or
- event participations.

Do not sum shift rows and label the result as unique volunteers.

### Review interpretation

The 1–5 review is intended to describe role/event performance. It should not be presented as a permanent judgement of a volunteer's character or suitability without context and staff review.

### Insight promotion

Accepted event insights are reviewed observations, not automatically canonical profile facts. Any future central-profile update should preserve provenance and allow human review/correction.

## 4. Integration failure modes to preserve

Future development must keep the current fail-closed principles:

- failed YM Hub handoffs/imports must not invalidate a valid KELUARGA registration or produce substitute verified records;
- stale backend data must be distinguishable from current KELUARGA operational state;
- ambiguous identity matches must enter an exception workflow rather than auto-linking;
- failed/partial authoritative attendance imports must not award points;
- no Salesforce/service-role credentials may reach browser code;
- unknown external status values should be rejected or quarantined rather than guessed.

## 5. Recently resolved defects and regressions

Keep these here because they are useful regression history even though they are not open bugs.

| Area | Resolved behaviour |
|---|---|
| Password recovery | Recovery links now enter the password-reset flow instead of acting like ordinary sign-in links and redirecting to the dashboard. |
| Supabase session refresh | Server request cookie/session forwarding was corrected so authenticated requests do not continue using stale JWT state. |
| Roster duplicates | Duplicate and match handling was hardened across available identifiers, including Singapore mobile normalization. |
| Walk-ins | Duplicate walk-in handling and service-role protections were hardened. |
| Attendance transitions | Invalid state transitions are enforced server-side rather than relying only on UI controls. |
| Continuous shifts | Attendance now supports continuity across adjacent shifts and early/final checkout cases. |
| Walk-in typo correction | Correcting a walk-in's name/email/mobile now propagates across that event's matching shift rows while retaining the same attendance/review/insight identity. |
| Slice 6 pathway privacy | Personal pathway reads now scope explicitly to the signed-in volunteer and browser RLS is self-only, preventing pathway managers from over-reading other volunteers' positions on personal surfaces (Issue #160). |

## 6. How to record new bugs

For a confirmed defect, create a GitHub Issue with:

1. affected route/feature;
2. reproducible steps;
3. expected behaviour;
4. actual behaviour;
5. event/account conditions needed to reproduce;
6. screenshots/logs with personal data removed;
7. severity and operational impact;
8. whether data integrity or security is involved;
9. regression test required before closure.

Data-integrity, authentication, authorization, RLS or cross-shift identity defects should be treated as higher priority than cosmetic issues.
