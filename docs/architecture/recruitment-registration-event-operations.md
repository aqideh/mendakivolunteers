# Recruitment, registration and Event Operations model

**Decision updated:** 24 September 2026  
**Status:** approved current model on staging

## Volunteer journey

```text
Prospective volunteer
    -> KELUARGA discovery / role pages
    -> FormSG
    -> MakLom lead review
    -> deliberate conversion/link
    -> core.volunteers canonical identity

Canonical volunteer
    -> KELUARGA opportunity registration
    -> staff confirmation / waitlist / rejection
    -> Event Operations roster
    -> KELUARGA check-in/out
    -> contribution candidate
    -> MakLom approval/adjustment/rejection
    -> approved hours shown in KELUARGA
```

KELUARGA has no separate live recruitment-application workflow. YM Hub/Salesforce is not part of the current volunteer-facing or event-day runtime.

## Ownership

| Workflow/data | Owner |
|---|---|
| Volunteer discovery and role information | KELUARGA |
| Prospective-volunteer form | FormSG |
| Lead review/status/conversion | MakLom |
| Canonical person UUID / KEL code | Shared `core.volunteers` |
| Staff-managed longitudinal profile | MakLom |
| Opportunity/programme/event | KELUARGA |
| Registration/capacity/waitlist | KELUARGA |
| Roster and Event Guide | KELUARGA |
| Operational attendance | KELUARGA |
| Approved contribution hours | MakLom review |
| Pathways/points/badges presentation | KELUARGA |
| Cross-event Volunteer Management reporting | MakLom |
| Future enterprise handoff | Separate downstream integration |

## Prospective-volunteer intake

Public volunteering CTAs use the approved FormSG volunteer registration form.

A FormSG response becomes a MakLom `volunteer_leads` row and remains a lead until staff deliberately accepts and converts/links it.

Conversion must:

1. check for an existing unambiguous volunteer profile;
2. link when a single safe match exists;
3. stop for staff review when matching is ambiguous;
4. otherwise create a new MakLom profile;
5. ensure the profile references one `core.volunteers.id`;
6. retain legacy identifiers as aliases;
7. record the resulting canonical identity on the converted lead.

Historical KELUARGA recruitment records remain provenance only.

## Opportunity registration

KELUARGA owns first-class opportunity registration.

Volunteers can select eligible shifts and receive explicit lifecycle states:

- pending;
- confirmed;
- waitlisted;
- rejected;
- cancelled;
- withdrawn.

Confirmed registrations populate Event Operations rosters idempotently. Waitlisted records never become active roster assignments without an explicit state transition.

## Event Operations

KELUARGA owns new operational events and their timeslots.

Supported workflows include:

- normal programme/event creation;
- multi-day and multi-shift operation;
- registration-to-roster handoff;
- manual/last-minute events;
- CSV/paste roster import;
- isolated or integrated manual rosters;
- walk-ins;
- continuous attendance across adjacent/overlapping shifts where configured;
- checkout and new check-in for separated shifts with a gap;
- early checkout;
- attendance correction and audit;
- Event Guides;
- event insights, reviews, feedback and reports.

Historical MakLom event/attendance tables are not a second source for new operations.

## Manual-event boundary

A manual event deliberately chooses:

- **isolated** — event-only roster/attendance; no canonical volunteer creation or longitudinal contribution submission;
- **integrated** — strong identifiers may match/create canonical volunteers; completed attendance may be submitted to MakLom contribution review.

The mode is explicit and must not change silently.

## Attendance and approved hours

KELUARGA check-in/out is operational evidence.

```text
check-in/out
  -> attendance session
  -> volunteer_contributions.pending
  -> MakLom review
       -> approved (possibly adjusted)
       -> rejected
       -> needs_review after later source correction
```

Only approved contribution records are presented as approved volunteer hours.

The old direct KELUARGA contribution-credit path is historical and is not the current approval model.

## Insights and reviews

Event observations remain contextual.

Accepted insights/reviews can enter the MakLom longitudinal review inbox while retaining:

- canonical volunteer reference where known;
- event ID;
- source record ID;
- event-role context;
- source payload/provenance.

They do not directly mutate permanent profile facts.

## Profile changes

KELUARGA permits only narrow self-service profile editing.

- display name is an app presentation field;
- mobile changes can be used in KELUARGA and sent to MakLom review;
- login email follows account/auth workflow;
- sensitive or staff-managed longitudinal fields belong to MakLom.

## Authorization

KELUARGA and MakLom have separate authorization despite shared infrastructure.

- KELUARGA: `core.user_roles`
- MakLom: `public.app_members`

KELUARGA staff tiers:

- `admin`
- `volteam` / **VolTeam**
- `staff`
- `volunteer_leader` / **volunteer leader**

Authorization is still enforced separately, but KELUARGA `admin` intentionally provisions MakLom `admin` membership transactionally. `volteam`, `staff` and `volunteer_leader` do not grant MakLom access.

## Future YM Hub/Salesforce integration

YM Hub/Salesforce integration is dormant and downstream.

No current KELUARGA feature should require:

- a Salesforce/YM Hub volunteer ID;
- a YM Hub registration;
- a YM Hub sync state; or
- a YM Hub verified-hours import.

Any future handoff must attach to the current canonical identity and preserve KELUARGA/MakLom ownership boundaries.
