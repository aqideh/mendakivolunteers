# Current system architecture

**Last reviewed:** 24 September 2026  
**Reference branch:** `staging`

KELUARGA and MakLom now use one shared Supabase data platform with one canonical volunteer identity. They remain separate applications with separate permission domains and different operational responsibilities.

For the detailed domain contract, see [KELUARGA + MakLom domain architecture](keluarga-maklom-domain-architecture.md).

## 1. System context

KELUARGA is the volunteer-facing application. It owns:

- public programme and opportunity discovery;
- KELUARGA accounts and self-service profile presentation;
- programme registration, waitlist and cancellation;
- canonical new programme/event records;
- rosters and Event Guides;
- event-day check-in/out and operational attendance;
- pathways, points and badges presentation;
- event feedback, reviews and operational insights.

MakLom is the Volunteer Management application. It owns:

- FormSG prospective-volunteer lead intake and review;
- deliberate lead-to-volunteer conversion;
- the staff-managed longitudinal volunteer profile;
- duplicate resolution, merge history and data-quality workflows;
- review of KELUARGA profile-change requests;
- review of event observations before longitudinal use;
- approval/adjustment of contribution hours;
- cross-event volunteer-management reporting;
- any future organisational/YM Hub handoff.

## 2. Canonical volunteer identity

```text
Supabase Auth user (when applicable)
        -> core.user_accounts
        -> core.volunteers.id          canonical UUID
        -> core.volunteers.volunteer_code (KELxxxxx)
        -> core.volunteer_aliases
        -> public.volunteers           MakLom 1:1 profile extension
```

`core.volunteers.id` is the shared person key. Email and mobile can support matching but are not permanent identifiers.

Every MakLom volunteer profile must have `public.volunteers.core_volunteer_id`. Legacy MakLom text IDs are retained as aliases rather than becoming a second identity.

## 3. Data ownership

| Domain | Current owner |
|---|---|
| Canonical person UUID / KEL ID | Shared `core.volunteers` |
| Volunteer-facing account/session | KELUARGA |
| MakLom managed volunteer profile | MakLom |
| Prospect/lead lifecycle | FormSG -> MakLom |
| Programme opportunity/event | KELUARGA |
| Registration/capacity/roster | KELUARGA |
| Operational attendance | KELUARGA |
| Approved contribution hours | MakLom review of KELUARGA attendance evidence |
| Event reviews/insights | KELUARGA source, MakLom reviewed longitudinal inbox |
| Pathways/points/badges | KELUARGA |
| Duplicate/merge management | MakLom |
| Future YM Hub handoff | Downstream/MakLom integration, not current KELUARGA runtime |

## 4. Recruitment

The previous KELUARGA recruitment application is retired.

```text
KELUARGA volunteering CTA
        -> FormSG
        -> MakLom volunteer_leads
        -> staff review
        -> accepted
        -> deliberate conversion/link
        -> public.volunteers
        -> core.volunteers UUID
```

Historical `keluarga_recruitment_applications` records remain for provenance but are not a live workflow.

## 5. Events and attendance

For new operations, `public.phaseone_events` and `phaseone_event_timeslots` are canonical. MakLom legacy `events`, `event_shifts` and `attendance_log` remain historical and may reference a KELUARGA event.

Operational hours flow is:

```text
KELUARGA check-in/out
        -> phaseone_attendance_sessions
        -> volunteer_contributions (pending / needs_review)
        -> MakLom review
        -> approved or rejected
        -> approved hours visible to the volunteer
```

KELUARGA cannot approve its own attendance-derived volunteer hours.

## 6. Profile changes and observations

KELUARGA display name is an app presentation field.

A volunteer mobile update is recorded in KELUARGA and also enters `volunteer_profile_change_inbox` for Volunteer Management review.

Accepted event insights and event reviews are copied into `maklom_profile_inbox` with their event/source provenance. They do not directly mutate the permanent MakLom profile.

## 7. Authorization

The database is shared; authorization is not.

- KELUARGA roles: `core.user_roles`.
- MakLom entitlement: `public.app_members`.

A KELUARGA role must never implicitly create MakLom access. Even an `admin` receives MakLom access only when separately provisioned in `app_members`.

Current KELUARGA role model:

- `admin` — full KELUARGA access; MakLom only with separate entitlement.
- `volteam` — full KELUARGA volunteer/event management without automatic MakLom access.
- `staff` — event operations without programme creation/deletion.
- `volunteer_leader` — reduced event operations focused on check-in/out.

## 8. YM Hub

The `ymhub` projection schema and `integration.ymhub_*` objects are dormant future infrastructure.

They are not a current prerequisite for:

- volunteer registration;
- Event Operations;
- volunteer identity creation;
- contribution-hour display; or
- KELUARGA-to-MakLom data flow.

Do not describe YM Hub as the current runtime authority for KELUARGA hours. Any future organisational synchronization is a separate downstream integration project.

## 9. Legacy objects

Keep historical objects until retention/migration is explicitly approved:

- `keluarga_recruitment_applications`;
- `keluarga_contribution_credits`;
- Volunteer.gov.sg import/override history;
- legacy MakLom event and attendance tables;
- superseded opportunity CMS objects;
- dormant YM Hub projection/import/export infrastructure.

These must not be used as parallel live sources merely because they still exist.

## 10. Architecture invariants

1. One person has one canonical `core.volunteers.id`.
2. Email is never the permanent cross-system join key.
3. A FormSG respondent is a lead until staff deliberately converts them.
4. KELUARGA owns new operational events, registrations, rosters and attendance.
5. MakLom owns the managed longitudinal profile and approved contribution-hours record.
6. Event observations retain source context and require review before longitudinal use.
7. KELUARGA and MakLom permissions remain separate.
8. YM Hub is not a current KELUARGA runtime dependency.
9. Legacy data is retained for provenance until an explicit cleanup migration.
