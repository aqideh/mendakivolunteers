# Recruitment, registration and event-operations operating model

**Decision updated:** 24 September 2026  
**Status:** Approved; staging implementation in progress

## 1. Operating model

The volunteer journey is split across three clear domains:

```text
Prospective volunteer
    -> KELUARGA discovery / role pages
    -> FormSG registration
    -> MakLom lead review
    -> deliberate volunteer conversion
    -> shared core.volunteers identity

Existing/canonical volunteer
    -> KELUARGA opportunity registration
    -> staff confirmation / waitlist / rejection
    -> Event Operations roster
    -> KELUARGA check-in/out
    -> contribution candidate
    -> MakLom approval/adjustment
    -> approved hours shown in KELUARGA
```

KELUARGA does not operate a separate recruitment-application workflow. YM Hub is not part of the current volunteer-facing or event-day runtime.

## 2. Ownership

| Workflow/data | Owner |
|---|---|
| Volunteer discovery and role information | KELUARGA |
| Prospective-volunteer form | FormSG |
| Lead review/status/conversion | MakLom |
| Canonical person UUID | shared `core.volunteers` |
| Staff-managed longitudinal profile | MakLom `public.volunteers` |
| Opportunity/programme/event | KELUARGA |
| Registration/capacity/waitlist | KELUARGA |
| Roster and Event Guide | KELUARGA |
| Operational attendance | KELUARGA |
| Approved contribution hours | MakLom review |
| Pathways/points/badges presentation | KELUARGA |
| Cross-event Volunteer Management reporting | MakLom |
| Future YM Hub/organisational handoff | downstream future integration |

## 3. Recruitment / lead intake

Public volunteering CTAs use:

`https://form.gov.sg/6ab08df24e9cff0f3ac1af45`

A FormSG response becomes a MakLom `volunteer_leads` row. It remains a lead until staff deliberately accept and convert it.

Conversion must:

1. check for an existing unambiguous MakLom volunteer profile;
2. link when a single safe match exists;
3. block when matching is ambiguous;
4. otherwise create a new MakLom profile;
5. ensure that profile has one canonical `core.volunteers.id`;
6. retain the old MakLom profile ID as an alias;
7. store both IDs on the converted lead.

Historical KELUARGA recruitment rows remain for provenance but are not a live write path.

## 4. Registration

KELUARGA owns opportunity registration.

A logged-in volunteer can submit registration and shift selection. KELUARGA records pending/confirmed/waitlisted/rejected/cancelled/withdrawn states and notifies the volunteer of staff decisions.

Confirmed registrations populate Event Operations rosters idempotently. Capacity/waitlist rules remain transactional KELUARGA rules.

## 5. Event Operations

KELUARGA owns new operational events using `phaseone_events` and event timeslots.

Supported workflows include:

- normal programme/event creation;
- multi-day/multi-shift operation;
- registration-to-roster handoff;
- manual/last-minute events;
- CSV/paste roster import;
- isolated manual rosters;
- integrated manual rosters that link/create canonical volunteers;
- walk-ins;
- continuous attendance across adjacent shifts;
- checkout/re-check-in for non-adjacent shifts/gaps;
- attendance correction/audit;
- Event Guides;
- event reviews, insights, feedback and exports.

Legacy MakLom event/attendance tables remain historical. A legacy MakLom event may reference a KELUARGA event through `public.events.keluarga_event_id`.

## 6. Attendance and approved hours

KELUARGA attendance is operational evidence, not self-approved longitudinal hours.

```text
check-in/out
  -> phaseone_attendance_sessions
  -> volunteer_contributions.pending
  -> MakLom review
       -> approved (possibly adjusted minutes)
       -> rejected
       -> needs_review after later KELUARGA correction
```

The volunteer dashboard reads only approved records belonging to the current canonical volunteer.

Manual integrated events use the same review boundary. The previous direct KELUARGA contribution-credit refresh function is retired.

## 7. Insights and reviews

Event reviews and insights remain source-context records.

Accepted insights and reviews can enter `maklom_profile_inbox`, retaining:

- canonical volunteer where known;
- event ID;
- source record ID;
- event-role context;
- original observation/review payload.

MakLom staff may review, accept/edit/dismiss information for longitudinal use. KELUARGA does not directly mutate permanent MakLom profile facts.

## 8. Profile changes

- KELUARGA display name is a presentation field.
- KELUARGA mobile edits remain usable in the volunteer experience and also create a MakLom review item.
- Sensitive/managed fields such as NRIC, address, emergency contact, programme history and staff notes belong to MakLom.

## 9. Manual-event data boundary

A quick/manual event must deliberately choose:

- **isolated** — roster/attendance stays event-local and does not create canonical volunteer records; or
- **integrated** — strong identifiers may link/create canonical volunteers and completed attendance may be submitted for MakLom contribution review.

No hidden or automatic conversion between these modes.

## 10. Authorization

KELUARGA and MakLom use separate authorization systems even though the database and Auth tenant are shared.

- KELUARGA: `core.user_roles`
- MakLom: `public.app_members`

KELUARGA role membership never automatically grants MakLom access.

KELUARGA staff tiers:

- `admin`
- `volteam`
- `staff`
- `volunteer_leader`

MakLom entitlement is separately provisioned because it contains higher-sensitivity Volunteer Management data.

## 11. YM Hub

YM Hub projection/import/export schemas remain dormant future infrastructure.

No current KELUARGA feature should require:

- a Salesforce/YM Hub volunteer ID;
- a YM Hub registration;
- a YM Hub sync-state record; or
- a YM Hub verified-hours import.

If a future organisational handoff is approved, design it downstream of this operating model rather than replacing the KELUARGA/MakLom identity spine.
