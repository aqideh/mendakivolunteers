# KELUARGA + MakLom domain architecture

**Status:** approved current architecture on KELUARGA staging  
**Last reviewed:** 24 September 2026

## Purpose

KELUARGA and MakLom serve the same volunteer population on one shared Supabase platform. They therefore share one canonical person identity while retaining separate application permissions and clear domain ownership.

The architecture is designed so the volunteer-facing journey does not depend on a future enterprise integration.

## Product responsibilities

### KELUARGA

Volunteer-facing and event-operations application:

- discovery, role/pathway information and opportunities;
- volunteer account and personal dashboard;
- programme registration, shift selection, waitlist and cancellation;
- Event Guides;
- rosters, walk-ins and manual-event operations;
- event-day check-in/out and attendance correction;
- event feedback, contextual reviews and insights;
- pathways, badges and points presentation.

### MakLom

Volunteer Management application:

- FormSG prospective-volunteer lead review;
- deliberate lead-to-volunteer conversion;
- staff-managed longitudinal volunteer profile;
- duplicate resolution and data-quality workflows;
- review of KELUARGA profile-change proposals;
- review of event observations before longitudinal use;
- approval/adjustment/rejection of contribution hours;
- cross-event Volunteer Management reporting.

### FormSG

Public prospective-volunteer intake channel. A submission creates a lead, not a canonical volunteer.

### YM Hub / Salesforce

Dormant future downstream integration. It is not a current KELUARGA or MakLom runtime dependency.

## Canonical identity

```text
Supabase Auth account (when applicable)
        |
        v
core.user_accounts
        |
        v
core.volunteers.id          canonical internal UUID
        |
        +-- volunteer_code  immutable KELxxxxx human identifier
        |
        +-- core.volunteer_aliases
        |      +-- MakLom legacy volunteer ID
        |      +-- future external identifiers
        |
        +-- public.volunteers.core_volunteer_id
               MakLom-managed 1:1 profile extension
```

Rules:

- `core.volunteers.id` is the canonical person key across KELUARGA and MakLom.
- Email and mobile can assist matching but are never permanent identity keys.
- Every MakLom profile references exactly one canonical person.
- Legacy MakLom text IDs are retained as aliases.
- Ambiguous matches must be reviewed rather than silently merged.
- A canonical volunteer does not require a YM Hub/Salesforce identifier.

## Domain ownership

| Domain | Owner | Behaviour |
|---|---|---|
| Public volunteer information/discovery | KELUARGA | Volunteer-facing content and opportunity pages |
| New programme/event record | KELUARGA | Canonical event source for new operations |
| Registration/capacity/waitlist/roster | KELUARGA | Drives Event Operations |
| Event Guide | KELUARGA | Volunteer-facing operational information |
| Event-day attendance | KELUARGA | Operational evidence and duration |
| Pathways/points/badges presentation | KELUARGA | Volunteer-facing recognition/development |
| Prospective-volunteer intake | FormSG -> MakLom | Submission becomes a lead |
| Lead review/conversion | MakLom | Deliberate conversion/link to canonical identity |
| Managed longitudinal profile | MakLom | Sensitive Volunteer Management fields |
| Duplicate/data-quality management | MakLom | Matching, aliases, merge/audit workflows |
| Approved contribution hours | MakLom | Reviews KELUARGA attendance evidence |
| Longitudinal insights/reporting | MakLom | Reviewed, contextual, cross-event use |
| Future organisational integration | Separate downstream integration | Must preserve current identity/ownership model |

## Recruitment and lead lifecycle

The former KELUARGA recruitment application is retired.

```text
KELUARGA role CTA
      -> FormSG
      -> MakLom volunteer_leads
            -> new / reviewing / contacted
            -> accepted
                  -> deliberate conversion/link
                  -> public.volunteers
                  -> core.volunteers.id
            -> not_selected / withdrawn
```

A lead remains separate from the canonical volunteer population until staff deliberately converts or links it.

## Registration and Event Operations

Canonical volunteers register directly in KELUARGA.

```text
opportunity
   -> registration + shift selection
   -> pending / confirmed / waitlisted / rejected
   -> confirmed registration
   -> roster assignment
   -> Event Guide
   -> event-day attendance
```

Manual events deliberately choose one of two boundaries:

- **isolated** — event-local roster/attendance only;
- **integrated** — strong identifiers may match/create canonical volunteers and completed attendance may become a contribution candidate.

No hidden conversion between these modes.

## Contribution-hour approval

```text
KELUARGA attendance session
      -> volunteer_contributions
         pending / needs_review
      -> MakLom review
         -> approved (possibly adjusted)
         -> rejected
      -> approved hours visible in KELUARGA
```

KELUARGA does not approve its own attendance-derived longitudinal hours.

Manual integrated events use the same review boundary.

## Profile and observation review

KELUARGA self-service changes and event observations are not automatically promoted into permanent MakLom profile truth.

Reviewed boundaries include:

- `volunteer_profile_change_inbox` for profile/contact proposals;
- `maklom_profile_inbox` for accepted insights/reviews with event/source provenance.

MakLom staff may accept, edit or dismiss these records according to the operational process.

## Authorization boundary

The Auth tenant may be shared; application authorization is not.

- KELUARGA permissions: `core.user_roles`
- MakLom permissions: `public.app_members`

KELUARGA tiers:

- **admin**
- **VolTeam** (`volteam`)
- **staff**
- **volunteer leader** (`volunteer_leader`)

KELUARGA `admin` is the intentional entitlement bridge: promotion to Admin creates/updates active MakLom `admin` membership, and demotion removes it transactionally. All other KELUARGA roles remain MakLom-ineligible unless the access model is changed deliberately.

## Dormant YM Hub boundary

`ymhub` and `integration.ymhub_*` objects are retained only as dormant future infrastructure.

They do not currently provide:

- volunteer identity authority;
- KELUARGA registration state;
- Event Operations state;
- approved contribution hours; or
- current KELUARGA/MakLom handoff.

If enterprise synchronization is later approved, it must attach to this identity spine rather than replacing it.

## Legacy retention

Historical objects remain until their retention/migration treatment is settled:

- `keluarga_recruitment_applications`;
- `keluarga_contribution_credits`;
- legacy MakLom `events`, `event_shifts`, `attendance_log`;
- Volunteer.gov.sg import/override tables;
- superseded opportunity CMS objects;
- dormant YM Hub projections/integration objects.

Presence in the database does not make a legacy object an active source of truth.

## Architecture invariants

1. One canonical person UUID across both applications.
2. Separate application authorization despite shared Auth/database.
3. FormSG creates leads; staff conversion creates/links volunteers.
4. KELUARGA owns new registration and operational attendance.
5. MakLom owns the managed longitudinal profile and approved contribution hours.
6. Operational observations retain context and require review before longitudinal use.
7. External enterprise integrations remain downstream of the current model.
