# KELUARGA + MakLom domain architecture

**Status:** approved target architecture, implemented on KELUARGA staging  
**Last reviewed:** 24 September 2026

## Purpose

KELUARGA and MakLom use the same volunteer population and the same Supabase database, but they serve different operating domains. The shared database must therefore have one canonical person identity while preserving separate application permissions and clear ownership of each record type.

## Canonical identity

```text
Supabase Auth account (when the volunteer has KELUARGA access)
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
        +-- public.volunteers
               MakLom-managed 1:1 profile extension
```

Rules:

- `core.volunteers.id` is the canonical person key across KELUARGA and MakLom.
- Email and mobile may assist matching but are never permanent identity keys.
- Every MakLom `public.volunteers` row must reference exactly one `core.volunteers` row through `core_volunteer_id`.
- The old MakLom text volunteer ID is retained in `core.volunteer_aliases` with source `maklom_legacy`.
- Ambiguous identity matches must be reviewed; they must not be silently merged.

## Domain ownership

| Domain | Owner | System behaviour |
|---|---|---|
| Public volunteer information and programme discovery | KELUARGA | Volunteer-facing content and opportunity pages. |
| Programme/event record for new operations | KELUARGA | `phaseone_events` and timeslots are canonical for new events. |
| Registration, capacity and roster | KELUARGA | Registration decisions populate Event Operations rosters. |
| Event-day attendance | KELUARGA | Check-in/out, continuous sessions, corrections and operational duration. |
| Event Guide | KELUARGA | Volunteer-facing operational information. |
| Pathways, points and badges presentation | KELUARGA | Volunteer-facing development and recognition. |
| Prospective-volunteer intake | FormSG -> MakLom | FormSG responses become MakLom leads; they are not volunteers automatically. |
| Lead review and conversion | MakLom | Staff review a lead and deliberately convert or link it to the canonical identity. |
| Staff-managed volunteer profile | MakLom | Sensitive and longitudinal Volunteer Management fields. |
| Duplicate/data-quality management | MakLom | Matching, suspected duplicates, merge history and audit. |
| Approved contribution hours | MakLom | KELUARGA supplies operational duration; MakLom approves or adjusts it. |
| Cross-event insights and longitudinal reporting | MakLom | Reviewed observations retain event provenance. |
| Future organisational/YM Hub handoff | MakLom / separate integration | Not an active KELUARGA runtime dependency. |

## Recruitment and lead lifecycle

The retired KELUARGA recruitment application is retained only for historical provenance.

```text
KELUARGA role CTA
      |
      v
FormSG volunteer registration
      |
      v
MakLom volunteer_leads
      |
      +-- new / reviewing / contacted
      +-- accepted
      |      |
      |      v
      |   deliberate conversion
      |      |
      |      +--> existing public.volunteers profile
      |      |        |
      |      |        +--> core.volunteers UUID
      |      |
      |      +--> new public.volunteers profile
      |               |
      |               +--> trigger creates/links core.volunteers UUID
      |
      +-- not_selected / withdrawn
```

A FormSG response is not a canonical volunteer until conversion. Conversion records both the MakLom profile ID and canonical KELUARGA UUID.

## Events and attendance

For new activity operations:

```text
phaseone_events
      |
      +--> phaseone_event_timeslots
      +--> registrations
      +--> roster
      +--> attendance sessions
                 |
                 v
       volunteer_contributions
          pending / needs_review
                 |
                 v
            MakLom review
                 |
          +------+------+
          |             |
       approved      rejected
          |
          v
KELUARGA volunteer dashboard
approved contribution hours
```

Legacy MakLom `events`, `event_shifts` and `attendance_log` remain for historical records. They must not become a second event/attendance source for new KELUARGA operations. A legacy MakLom event may reference a canonical KELUARGA event through `public.events.keluarga_event_id`.

## Profile-field ownership

| Field/type | Write owner | Notes |
|---|---|---|
| KELUARGA display name | Volunteer/KELUARGA | Presentation field; does not overwrite MakLom managed name automatically. |
| Auth email | Supabase Auth/account workflow | Identity/contact change requires controlled account handling. |
| Mobile | Volunteer may edit in KELUARGA | Change is also placed in `volunteer_profile_change_inbox` for MakLom review. |
| NRIC, address, emergency contact, programme history, staff notes and similar managed fields | MakLom | Not volunteer-self-service KELUARGA fields. |
| Event reviews/insights | KELUARGA creates event-context observation | MakLom receives a reviewed inbox item; no direct permanent-profile mutation. |

## Review inboxes

Two reviewed boundaries prevent operational data from becoming permanent profile truth automatically:

1. `volunteer_profile_change_inbox` — contact/profile changes that Volunteer Management should review.
2. `maklom_profile_inbox` — accepted KELUARGA insights and event reviews, retaining source event and source record.

MakLom may accept, edit or dismiss these records. Event-specific ratings and comments remain contextual evidence, not permanent character labels.

## Access domains

KELUARGA and MakLom authentication may use the same Supabase Auth user, but authorization remains separate.

- KELUARGA permissions: `core.user_roles`.
- MakLom permissions: `public.app_members`.
- A KELUARGA staff role does not implicitly grant MakLom access.
- MakLom remains the higher-sensitivity Volunteer Management surface.

The product role model is:

- **admin** — full KELUARGA access and, when explicitly provisioned in `app_members`, MakLom access.
- **VolTeam** — full KELUARGA operational/management access, without automatic MakLom entitlement.
- **staff** — event operations without programme creation/deletion.
- **volunteer leader** — reduced event operations, focused on basic check-in/out.

MakLom entitlement must still be provisioned separately even when the KELUARGA role is `admin`.

## YM Hub boundary

The `ymhub` and `integration.ymhub_*` schemas are dormant future infrastructure. They are not the current source for:

- KELUARGA registrations;
- live event operations;
- current volunteer dashboard hours; or
- the present KELUARGA-to-MakLom handoff.

No active KELUARGA feature should require a YM Hub record to function. Any future organisational handoff is a separate integration owned downstream of the KELUARGA/MakLom operating model.

## Legacy objects retained for controlled cleanup

The following are not current canonical runtime sources and should be retired only through deliberate later migrations after retention requirements are confirmed:

- `keluarga_recruitment_applications` and its history;
- `keluarga_contribution_credits`;
- MakLom legacy `events`, `event_shifts`, `attendance_log` for historical records;
- `content.opportunities` where superseded by canonical KELUARGA programme records;
- Volunteer.gov.sg import/override tables;
- dormant YM Hub projection/import/export tables.

Do not delete these merely to simplify naming; preserve historical provenance until migration/retention work is complete.
