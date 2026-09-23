# Gamification and points architecture

## Purpose

KELUARGA owns the volunteer points programme, recruitment and registration workflow. YM Hub remains the authoritative backend record for verified attendance and verified hours after the approved handoff/reconciliation process.

KELUARGA has two explicit point-source paths:

```text
verified ymhub.attendance_snapshots
        -> approved KELUARGA attendance rule
        -> append-only point ledger

staff recognition action
        -> role + reason validation
        -> append-only manual recognition entry

both paths
        -> volunteer point balance and history
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

External registration destinations are transitional. The target model registers volunteers directly in KELUARGA and hands the resulting records to event operations and, separately, to YM Hub on the backend.

## Account and identity model

The canonical identity chain is:

```text
Supabase Auth user ID
        <-> core.user_accounts.id
        <-> core.volunteers.auth_user_id
        <-> core.volunteers.volunteer_code (KELxxxxx)
        <-> optional core.volunteers.ymhub_volunteer_id
```

`core.volunteers.id` is the internal relational UUID. `core.volunteers.volunteer_code` is the immutable human-facing KELUARGA identifier (`KEL00001` format). `ymhub_volunteer_id` is optional and attached only for backend reconciliation. Email may assist matching but is not the permanent volunteer identifier.

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

Only the server-side integration identity can run YM Hub reconciliation. Manual recognition awards use a separate security-definer function that requires an active `gamification_manager` or `admin` role, a positive amount, a reason and an idempotency request ID. Volunteers receive their own balance and recent history through a protected account-scoped function. The private gamification schema is not exposed to ordinary browser queries.

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

The roster is populated from KELUARGA registrations (plus explicit walk-ins) in the target model. Its later handoff to YM Hub may lead to a verified attendance record; only the verified record should enter any points rule that requires verified attendance.


## Manual recognition

Manual recognition is intentionally not represented as attendance. The source kind is `manual_recognition`, while verified attendance uses `ymhub_verified_attendance`.

A manual recognition award:

- is created only through `core.award_manual_points`;
- requires `gamification_manager` or `admin`;
- requires an explicit reason;
- uses a request UUID to make retries idempotent;
- writes an append-only ledger entry and a separate audit event;
- never creates or edits `ymhub.attendance_snapshots`.

This keeps staff recognition available as an operational KELUARGA feature without weakening the rule that verified hours and verified attendance remain YM Hub-owned.


## Data API boundary

The gamification schema is included in PostgREST's schema list so trusted server/service-role administration can address it. This does **not** make gamification tables public: `anon` and `authenticated` browser roles retain no schema usage or direct table grants. Volunteer-facing recognition reads use account-scoped security-definer functions, while privileged administration remains server-side and role-gated.
