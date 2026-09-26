# Gamification and recognition architecture

**Last reviewed:** 24 September 2026

## Purpose

KELUARGA owns the volunteer-facing recognition experience: points, badges, pathway status and personal history.

Attendance-derived recognition must use **MakLom-approved contribution records**, not raw KELUARGA check-in/out data and not dormant YM Hub projections.

## Recognition sources

```text
MakLom-approved contribution
        -> approved attendance/contribution rule
        -> append-only KELUARGA point ledger

staff recognition action
        -> role + reason validation
        -> append-only manual-recognition entry

both paths
        -> volunteer point balance/history
```

Raw Event Operations attendance is operational evidence only.

## Identity

Recognition attaches to the canonical volunteer:

```text
auth.users
  -> core.user_accounts
  -> core.volunteers.id
  -> core.volunteers.volunteer_code (KELxxxxx)
```

External enterprise IDs are optional metadata and are not part of the recognition identity chain.

## Point rules

Rules are versioned and may support:

- flat points for an eligible approved contribution;
- points per approved volunteer hour.

Draft rules award nothing. Activated rules should be immutable for their effective period so historical calculation remains reproducible.

Before activating attendance-derived rules, Volunteer Management must define:

- eligible contribution types;
- value and calculation method;
- effective dates;
- correction/reversal behaviour;
- appeals;
- anti-abuse controls.

## Recognition policy v1 (27 September 2026)

The version 1 rules activate when the migration is applied in each environment. Older approved contributions count towards badge thresholds, but do not generate retroactive points. New MakLom approvals earn 10 points per approved hour, calculated from cumulative approved minutes and rounded to two decimal places. The first newly approved contribution earns a 20-point bonus. A volunteer newly crossing 15, 30 and 60 cumulative approved hours earns 50, 100 and 200 bonus points respectively.

A signed-in volunteer who opens a published opportunity earns 2 points at most once per ISO week in Singapore. Explicit confirmation that profile details are current earns 2 points at most once per Singapore calendar month. Completion of all nine profile milestones earns 20 points once; the database checks the underlying fields. Browsing, reviewing and completion have separate source identifiers and cannot be multiplied by refreshing.

Automatic profile badges are First Step, Helping Hand (15 hours), Community Builder (30 hours) and Community Champion (60 hours). These use the entire cumulative approved contribution history. MENDAKI Appreciation remains staff awarded. Existing staff awards are separate from automatic milestone awards.

Corrections to approved contributions reconcile hour points and add reversal entries where needed. Corrections below a milestone reverse its bonus and revoke its automatically awarded badge. Returning above a threshold may award the bonus again only after reversal; a badge is re-awarded with its history retained. Staff awarded badges remain independent. Withdrawals, inactivity and private answers cause no negative points. Registrations and raw check-in/out do not award volunteering points. No public leaderboard is planned.

## Operational activation

The migration installs a trigger on MakLom contribution review, three activated rule versions and five badge definitions. Staff should confirm a real first approval, a partial hour, a milestone crossing and an adjustment/reversal in staging before production promotion. The volunteer profile reads badges from the existing scoped snapshot.

## Point ledger

`gamification.point_ledger_entries` is append-only.

Corrections create adjustments/reversals rather than rewriting history. The ledger must retain clear provenance so volunteers and staff can distinguish:

- approved contribution awards;
- manual staff recognition;
- adjustments/reversals.

## Manual recognition

Manual recognition is independent of attendance.

It requires:

- an authorized staff role;
- a positive amount;
- an explicit reason;
- an idempotency request identifier;
- an audit event.

It must not create or edit attendance or contribution records.

## Badges

Badge definitions and award/revocation history remain separate from points.

Volunteer-facing reads expose only safe badge information. Internal reasons, staff actors and administrative metadata remain restricted.

Automatic First Step and 15/30/60 hour badges use MakLom-approved contributions. Other badges continue to require staff review.

## Pathways

Pathway positions are staff-confirmed and do not advance automatically from attendance, points or registrations.

Any future automation must be explicit, explainable, auditable and staff-overridable.

## Dormant YM Hub reconciliation

Earlier YM Hub attendance reconciliation code/schema is retained only as historical/dormant infrastructure. It is not the current input contract for attendance-derived points.

If enterprise synchronization is later reactivated, it must not bypass the MakLom approval boundary for contribution hours unless the operating model is deliberately changed and documented.
