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

Automatic badge/milestone earning is not active until objective criteria and correction rules are approved.

## Pathways

Pathway positions are staff-confirmed and do not advance automatically from attendance, points or registrations.

Any future automation must be explicit, explainable, auditable and staff-overridable.

## Dormant YM Hub reconciliation

Earlier YM Hub attendance reconciliation code/schema is retained only as historical/dormant infrastructure. It is not the current input contract for attendance-derived points.

If enterprise synchronization is later reactivated, it must not bypass the MakLom approval boundary for contribution hours unless the operating model is deliberately changed and documented.
