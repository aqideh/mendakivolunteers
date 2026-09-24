# Current system architecture

**Last reviewed:** 24 September 2026  
**Reference branch:** `staging`

## Mission and system boundary

KELUARGA is MENDAKI's volunteer-facing application. MakLom is the higher-sensitivity Volunteer Management application. They use one shared Supabase data platform and one canonical volunteer identity, but each application has a distinct responsibility and authorization boundary.

KELUARGA owns the journey from opportunity discovery through registration and event-day operations. MakLom owns prospective-volunteer lead review, the managed longitudinal profile, approved contribution hours, data quality and cross-event Volunteer Management review.

YM Hub/Salesforce is dormant future downstream integration infrastructure and is not required for current KELUARGA or MakLom workflows.

## System context

```text
                         +------------------+
Prospective volunteer -> |    KELUARGA      |
                         | discovery / CTAs |
                         +---------+--------+
                                   |
                                   v
                                FormSG
                                   |
                                   v
                         +---------+--------+
                         |     MakLom       |
                         | lead review      |
                         | profile / hours  |
                         +---------+--------+
                                   |
                                   v
                         core.volunteers.id
                         canonical person UUID
                                   ^
                                   |
                         +---------+--------+
Canonical volunteer  ->  |    KELUARGA      |
                         | registration     |
                         | Event Operations |
                         +------------------+
```

## Canonical volunteer identity

```text
Supabase Auth user (when applicable)
        -> core.user_accounts
        -> core.volunteers.id                 canonical UUID
        -> core.volunteers.volunteer_code     immutable KELxxxxx code
        -> core.volunteer_aliases             legacy/future external IDs
        -> public.volunteers.core_volunteer_id
                                                MakLom 1:1 profile extension
```

Rules:

- one person has one canonical `core.volunteers.id`;
- email/mobile may assist matching but are not permanent identity keys;
- ambiguous matches require staff review;
- legacy MakLom IDs are aliases, not a second person identity;
- a volunteer may exist without a YM Hub/Salesforce record.

## Domain ownership

| Domain | Owner |
|---|---|
| Canonical person UUID / KEL code | Shared `core.volunteers` |
| Volunteer-facing authentication/account | KELUARGA |
| Volunteer discovery and opportunity pages | KELUARGA |
| Programme/event record for new operations | KELUARGA |
| Registration, capacity, waitlist, roster | KELUARGA |
| Event Guide and operational attendance | KELUARGA |
| Pathways, points, badges presentation | KELUARGA |
| Prospective-volunteer form | FormSG |
| Lead review/status/conversion | MakLom |
| Staff-managed longitudinal volunteer profile | MakLom |
| Duplicate/data-quality management | MakLom |
| Approved contribution hours | MakLom review |
| Reviewed longitudinal insights/profile changes | MakLom |
| Cross-event Volunteer Management reporting | MakLom |
| Future YM Hub/Salesforce handoff | Separate downstream integration |

## Recruitment / lead flow

The former KELUARGA recruitment-application workflow is retired.

```text
KELUARGA volunteering CTA
        -> FormSG
        -> MakLom volunteer_leads
        -> staff review
        -> accepted
        -> deliberate conversion/link
        -> public.volunteers
        -> core.volunteers.id
```

A FormSG submission remains a lead until deliberate staff conversion.

Historical KELUARGA recruitment rows may remain for provenance but are not a live workflow.

## Registration and Event Operations

KELUARGA owns direct volunteer registration and new event operations.

Confirmed registrations populate rosters idempotently. Event Operations supports normal programme events, manual/last-minute events, integrated or isolated rosters, walk-ins, multiple shifts, continuous adjacent-shift attendance, corrections, insights, reviews, feedback and exports.

For new operations, `phaseone_events` and associated timeslots remain the deployed canonical event structures. Historical `phaseone` naming is retained as a contract, not as an architectural phase boundary.

## Attendance and approved contribution hours

KELUARGA attendance is operational evidence.

```text
KELUARGA check-in/out
        -> attendance session
        -> volunteer_contributions
           pending / needs_review
        -> MakLom review
        -> approved / adjusted / rejected
        -> approved hours shown in KELUARGA
```

KELUARGA cannot self-approve attendance-derived contribution hours.

A later correction to approved attendance must return the contribution to a reviewable state.

## Profile changes and event observations

KELUARGA self-service fields remain deliberately narrow.

- display name is an app presentation field;
- mobile changes may be used in KELUARGA and also enter a MakLom review inbox;
- sensitive/managed longitudinal fields belong to MakLom;
- event insights/reviews retain event context and do not directly become permanent profile facts.

## Authorization

Shared database does not mean shared permissions.

- KELUARGA roles: `core.user_roles`
- MakLom entitlement: `public.app_members`

KELUARGA staff tiers:

- `admin`
- `volteam` (displayed as **VolTeam**)
- `staff`
- `volunteer_leader` (displayed as **volunteer leader**)

MakLom authorization remains separately enforced through `public.app_members`. KELUARGA `admin` intentionally synchronizes an active MakLom `admin` membership; `volteam`, `staff` and `volunteer_leader` do not grant MakLom access.

## YM Hub / Salesforce boundary

The `ymhub` and `integration.ymhub_*` schemas are dormant future infrastructure. They are not required for:

- account or volunteer creation;
- opportunity registration;
- Event Operations;
- current approved-hours display;
- current KELUARGA -> MakLom data flow.

Any future organisational synchronization must be designed downstream of the current canonical identity and ownership model.

## Legacy objects

Historical objects may remain until retention/migration work is approved, including:

- `keluarga_recruitment_applications`;
- `keluarga_contribution_credits`;
- Volunteer.gov.sg import/override history;
- legacy MakLom event/attendance tables;
- superseded opportunity CMS objects;
- dormant YM Hub projection/integration objects.

Their presence does not make them active sources of truth.

## Architecture invariants

1. One person, one canonical `core.volunteers.id`.
2. Email/mobile are matching evidence, not permanent joins.
3. A FormSG respondent is a lead until deliberate conversion.
4. KELUARGA owns new registrations, rosters and operational attendance.
5. MakLom owns managed longitudinal profile data and approved contribution hours.
6. Operational observations retain provenance and require review before longitudinal use.
7. KELUARGA and MakLom permissions remain separate.
8. YM Hub/Salesforce is not a current runtime dependency.
9. Legacy data is retained only for provenance/controlled migration, not as a parallel live source.
