# Development roadmap

**Last reviewed:** 24 September 2026  
**Reference branch:** `staging`

This roadmap follows the approved KELUARGA + MakLom domain architecture. KELUARGA owns volunteer-facing registration and live event operations. FormSG feeds prospective-volunteer leads to MakLom. MakLom owns Volunteer Management review, the longitudinal profile and approved contribution records. YM Hub is dormant future integration infrastructure and is not a current KELUARGA runtime dependency.

See `docs/architecture/keluarga-maklom-domain-architecture.md` for the domain contract.

## Status labels

- **Live** — implemented in the active application/database for the referenced environment.
- **Foundation live** — schema and core contract exist; an operational UI/process is still incomplete.
- **Planned** — agreed next work.
- **Decision required** — policy or product rule must be approved before implementation.
- **Dormant** — retained for possible future use but not part of the current runtime model.

## Development to-do checklist

- [ ] Build MakLom **Contribution Review** UI: pending / needs-review queue, approve, adjust minutes, reject, audit history and reviewer metadata.
- [ ] Build MakLom **Profile Change Review** UI for KELUARGA-submitted contact/profile changes, including approve/reject/apply actions.
- [ ] Build MakLom **Insights & Reviews Inbox** with source event context, accept/edit/dismiss workflow and longitudinal volunteer history.
- [ ] Complete the **FormSG -> MakLom lead webhook** production configuration, secret setup, field mapping and one controlled end-to-end submission test.
- [ ] Run a **production migration rehearsal** against the current production database, including all existing MakLom volunteer records and the independently-created production `volunteer_leads` table.
- [ ] Promote the shared identity/contribution/inbox architecture to production only after the migration rehearsal and staging UAT pass.
- [ ] Run end-to-end UAT for: FormSG lead -> MakLom conversion -> KELUARGA registration -> roster -> attendance -> contribution review -> approved hours on volunteer dashboard.
- [ ] Define and implement the future **attendance-derived points rule** using only MakLom-approved contribution records; keep automatic attendance points disabled until then.

## P0 — finish and validate the shared KELUARGA + MakLom operating model

### Canonical identity

**Staging: live**

- `core.volunteers.id` is the canonical person UUID.
- `KELxxxxx` remains the human-facing KELUARGA volunteer ID.
- Every MakLom volunteer profile references a canonical UUID.
- MakLom legacy volunteer IDs are retained as aliases.
- New MakLom volunteer profiles automatically create/link canonical identity.
- Email/mobile may support matching but are not permanent identity keys.

**Next:** run production migration rehearsal against the current production lead schema, then promote only after staging UAT.

### Prospective-volunteer leads

**MakLom foundation: live**

- public KELUARGA role CTAs point to FormSG;
- the old KELUARGA recruitment UI/RPC write path is retired;
- MakLom `volunteer_leads` owns lead status and staff review;
- a lead must be accepted before deliberate conversion;
- conversion records both the MakLom profile ID and canonical KELUARGA UUID;
- duplicate ambiguity blocks automatic conversion.

**Next:** complete FormSG webhook configuration and confirm one controlled end-to-end submission.

### Contribution hours

**Staging foundation: live**

- KELUARGA records operational attendance;
- completed sessions populate/refresh `volunteer_contributions`;
- corrections to an approved session return the record to `needs_review`;
- KELUARGA cannot approve attendance-derived hours;
- only MakLom-approved contributions appear as approved hours on the volunteer dashboard;
- old KELUARGA instant-credit reconciliation is retired.

**Next:** build the MakLom contribution review queue with approve/adjust/reject actions and audit history.

### Profile and insight review boundaries

**Staging foundation: live**

- KELUARGA mobile changes can enter a MakLom review inbox;
- KELUARGA event reviews/accepted insights enter a MakLom inbox with event/source provenance;
- no event rating or observation silently becomes a permanent profile fact.

**Next:** build MakLom review interfaces for profile changes and longitudinal insight promotion.

## P1 — launch hardening

1. Run realistic event-day UAT across single-shift, adjacent-shift, gap-between-shifts, early checkout, walk-in and correction cases.
2. Test manual isolated and manual integrated CSV rosters.
3. Verify registration -> roster -> attendance -> contribution candidate -> MakLom approval -> volunteer dashboard end to end.
4. Verify role boundaries for `admin`, `volteam`, `staff` and `volunteer_leader`.
5. Verify MakLom entitlement remains separate from KELUARGA roles.
6. Confirm Event Guide public/private content policy.
7. Confirm support and retention procedures for operational exports and historical tables.

## P2 — volunteer experience and recognition

### Dashboard/profile

**Staging: active shared-data model**

- KELUARGA identity and registration state;
- approved MakLom contribution hours;
- audited self-service display-name/mobile editing;
- pathway positions and badges;
- no live YM Hub sync dependency.

### Points

**Manual recognition: live**  
**Attendance-derived automation: paused**

Manual staff-recognition awards remain available and audited.

Before reactivating automatic attendance points, define:

- eligible approved contribution types;
- points-per-hour or flat award rule;
- effective dates;
- corrections/reversals;
- appeals;
- anti-abuse controls.

The input must be MakLom-approved contribution records, not raw KELUARGA check-in/out data.

### Badges/pathways

Continue staff-confirmed pathway positions and manual recognition badges. Any future automatic advancement must use explicit, reviewable rules and preserve human override.

## P3 — Volunteer Management intelligence

1. Cross-event MakLom volunteer history.
2. Contribution/hour review reporting.
3. Reviewed insight/profile inbox.
4. Duplicate-resolution workflow using canonical UUID + retained aliases.
5. Impact reporting that explicitly separates unique volunteers, event participations, shifts, sessions and approved hours.
6. Referral outcomes and rewards only after a defined authoritative success condition.

## P4 — controlled legacy retirement

Retain until migration/retention requirements are satisfied:

- historical `keluarga_recruitment_applications`;
- historical `keluarga_contribution_credits`;
- Volunteer.gov.sg import/override tables;
- legacy MakLom `events`, `event_shifts`, `attendance_log`;
- superseded opportunity CMS tables;
- dormant `ymhub` and `integration.ymhub_*` objects.

Remove a legacy object only after its remaining data has a documented destination or retention decision.

## P5 — future organisational integration

YM Hub/Salesforce is a future downstream integration project, not a prerequisite for current KELUARGA operation.

If reactivated:

- keep credentials server-only;
- map using canonical volunteer/event identifiers;
- use idempotent, auditable handoff;
- handle merges/corrections explicitly;
- do not redesign volunteer-facing flows around Salesforce IDs;
- keep the shared KELUARGA + MakLom identity model intact.

## Release rules

- `main` remains production.
- `staging` is the KELUARGA verification environment.
- Database changes require committed forward migrations and database regression coverage.
- Do not promote shared-schema changes to production until current production data/contracts have been rehearsed against the migration.
- User-visible changes update the feature inventory, architecture docs and known-issues register.
- Security and identity boundaries fail closed.
