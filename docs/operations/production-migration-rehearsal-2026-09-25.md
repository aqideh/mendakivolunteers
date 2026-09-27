# Production migration rehearsal — 25 September 2026

**Environment:** production Supabase schema inspected; all rehearsal DDL executed inside transactions and rolled back.  
**Release candidate:** KELUARGA staging after consolidation commit `322ceff1e39faaa373b89a41b169edacd3c1e7fb`.

## Result

The production migration rehearsal passed. Do not replay the staging migrations verbatim: production has already received a later MakLom canonical-identity migration and therefore needs a production-specific forward bridge.

## Production identity invariants

- MakLom profiles: **574**
- Canonical `core.volunteers`: **574**
- Unlinked MakLom profiles: **0**
- Distinct canonical UUIDs referenced by MakLom profiles: **574**
- Distinct KEL volunteer codes: **574**
- Existing FormSG volunteer leads: **0**

Production already has:

- `public.volunteers.core_volunteer_id` (required)
- `public.volunteers.legacy_maklom_id`
- `public.volunteers.profile_origin`
- immutable canonical-link trigger
- MakLom -> core name/email/mobile synchronisation
- canonical MakLom match/create workflow
- canonical lead conversion workflow

These production-specific fields and functions must be preserved.

### Legacy profile provenance

Current profile origins:

- 531 legacy profiles
- 16 event-report-origin profiles
- 27 event-repair-origin profiles

These remain provenance metadata only. They do not determine the canonical identity or KEL volunteer code.

## Role migration rehearsal

Current KELUARGA role assignments:

- 4 active administrators
- 9 volunteers
- 0 assignments using legacy staff roles

The additive enum migration for:

- `volteam`
- `staff`
- `volunteer_leader`

successfully executed inside a transaction and rolled back.

The simplified-role guard passes because there are no legacy staff-role assignments.

### Expected production access effect

The approved access model makes KELUARGA `admin` include MakLom access. Production currently has four active KELUARGA admins but only one active MakLom admin. The production role migration will therefore provision MakLom admin membership for all four active KELUARGA admins.

Lower KELUARGA roles do not receive MakLom membership automatically.

## Shared architecture bridge rehearsal

A production-specific bridge was executed in a transaction and rolled back successfully.

Expected results during the rehearsal:

- 574 MakLom legacy aliases created
- 0 unlinked profiles after alias creation
- canonical MakLom event link column can be added safely
- contribution review tables/functions/triggers can be created safely
- profile-change review inbox can be created safely
- MakLom insight/review inbox can be created safely
- existing production volunteer/profile data remains unchanged

There are currently no completed KELUARGA attendance sessions eligible for contribution backfill, so `volunteer_contributions` would initially contain zero rows.

## Production-specific profile-change guard

Production MakLom already synchronises managed profile changes into `core.volunteers`.

The KELUARGA -> MakLom profile-change trigger must therefore ignore changes made by an active MakLom member. Otherwise a MakLom phone edit would create a review request for the same MakLom edit.

The rehearsed bridge includes this guard:

- changes made by active MakLom members: no review-inbox record;
- KELUARGA volunteer self-service mobile changes: create/supersede MakLom review-inbox records.

## MakLom audit compatibility

The production MakLom audit allow-list already contains `volunteer_leads`; no corrective audit migration is required for that table.

## Required production migration sequence

1. Apply the additive KELUARGA staff-role enum values.
2. Apply the simplified staff-role model and MakLom-admin bridge.
3. Add/backfill `core.volunteer_aliases` from existing production canonical links without re-canonicalising anyone.
4. Add the KELUARGA-event reference to legacy MakLom events.
5. Add contribution review tables, audit, operational-attendance capture and MakLom approval boundary.
6. Add profile-change and insight/review inboxes, using the production-specific MakLom-origin guard.
7. Retire KELUARGA recruitment write RPCs and legacy direct contribution-credit refresh.
8. Verify row counts, RLS/privileges, admin memberships and canonical identity invariants.
9. Run Supabase security/performance advisors.
10. Promote the consolidated KELUARGA application only after database verification succeeds.

## Release invariants

After production migration:

- `public.volunteers` remains 574 rows unless a real new lead/volunteer is deliberately added.
- Every MakLom profile has one canonical UUID.
- Existing `legacy_maklom_id` and `profile_origin` data are preserved.
- No existing KEL code is regenerated.
- No email-based destructive merge is performed.
- Existing MakLom events/attendance remain historical.
- KELUARGA cannot approve its own attendance-derived hours.
- MakLom permissions remain separate except for the explicitly approved KELUARGA-admin -> MakLom-admin bridge.
