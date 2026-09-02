# Gamification and points architecture

## Purpose

KELUARGA owns the volunteer points programme, but it does not decide whether an
activity was officially attended. YM Hub remains authoritative for volunteer
identity, registration, verified attendance and verified hours.

The points pipeline is therefore:

```text
YM Hub volunteer / Person Account ID
        -> core.volunteers.id
        -> verified ymhub.attendance_snapshots
        -> approved KELUARGA point rule
        -> append-only point ledger
        -> volunteer point balance
```

Staff roster check-in and check-out records are operational evidence only. They
are deliberately excluded from point calculation. A roster action cannot award
points before the corresponding attendance record is verified in YM Hub.

## Public and personal access

Public opportunity and news pages remain available without signing in. Personal
information requires a KELUARGA session:

- Event Guides and upcoming assignments;
- official activity and verified-hour records;
- points and point history.

A passwordless email link creates an ordinary KELUARGA browser session. It is a
sign-in method, not a requirement to request a new email on every page visit.

The official registration destination remains configuration-driven. It can move
from Volunteer.gov.sg to YM Hub without changing the KELUARGA identity or points
model.

## Account and identity model

The canonical identity chain is:

```text
Supabase Auth user ID
        <-> core.user_accounts.id
        <-> core.volunteers.auth_user_id
        <-> core.volunteers.ymhub_volunteer_id
```

`ymhub_volunteer_id` is the stable authoritative identifier. A verified email is
used only to link an account when exactly one approved YM Hub volunteer record
matches. Shared or ambiguous email matches are sent to an exception case rather
than linked automatically. The transitional event-roster email match remains in
place so staff Event Guide operations continue during batch-integration rollout.

## Point rules

Rules are versioned and support two calculation methods:

- a flat value for each qualifying verified activity;
- a value per verified volunteer hour.

Draft rules award nothing. An activated rule is immutable and retained so a
future recalculation can reproduce the original outcome. Effective periods may
not overlap. No production rule is created by the foundation migration; MENDAKI
must approve the point policy, effective date and value before activation.

## Point ledger

`gamification.point_ledger_entries` is append-only. It stores awards,
adjustments and reversals. When an authoritative YM Hub record changes, the
reconciliation function appends the difference instead of editing history.

This provides:

- idempotent recalculation;
- a traceable source attendance ID;
- transparent corrections and reversals;
- a balance derived from the complete ledger;
- no dependency on mutable roster attendance.

Only the server-side integration identity can run reconciliation or write point
records. Volunteers receive their own balance and recent history through a
protected account-scoped function. The private gamification schema is not exposed
to ordinary browser queries.

## Batch integration contract

After each successful YM Hub attendance import, the batch worker should call:

```sql
select ymhub.reconcile_gamification_points();
```

The function must run only after the authoritative import transaction has
completed successfully. A failed or partial import must not generate substitute
points. Future attendance corrections are processed through the same function.

## Staff roster boundary

The gamification schema has no foreign key, trigger or query against:

- `public.phaseone_roster`;
- `public.phaseone_attendance`;
- staff event-operation check-in or check-out actions.

The roster feature continues to operate independently. Its eventual export to YM
Hub may lead to an authoritative verified record later, but only that verified YM
Hub snapshot can enter point calculation.
