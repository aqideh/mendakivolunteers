# Volunteer Pathways architecture

**Last reviewed:** 24 September 2026

## Purpose

Volunteer Pathways gives volunteers a clear view of possible development roles and lets authorized staff confirm a volunteer's current position without inferring progression from attendance, points or registrations.

## Ownership

KELUARGA owns:

- the published pathway map;
- draft/published pathway versions;
- tracks, phases, stages and role options;
- pathway publication/audit history;
- staff-confirmed individual pathway positions;
- volunteer-facing pathway presentation.

YM Hub/Salesforce is not part of the current pathway runtime.

## Routes

Volunteer:

- `/pathways`

Staff:

- `/admin/pathways`
- pathway preview/position-management surfaces

## Version model

The `pathways` schema retains versioned maps and child structures.

Published versions are immutable. Staff edit drafts, preview them and publish a complete reviewed version. Historical versions remain available for audit/history.

## Authorization

Under the current four-tier staff model:

- `admin` and `volteam` can manage pathway content/positions;
- `staff` and `volunteer_leader` do not receive pathway-management access merely from Event Operations duties.

Privileged writes remain server-side/role-gated. Volunteer-facing reads expose only published/current safe data.

## Volunteer positioning

`pathways.volunteer_positions` uses `core.volunteers.id` as the canonical person key.

Rules:

- one active position per volunteer per pathway track;
- assigning the same active stage is idempotent;
- assigning a new stage closes the previous active history row instead of overwriting it;
- Explorer is the default when no active position exists;
- attendance, registrations and points do not advance pathway position automatically;
- volunteer-facing snapshots omit internal staff reasons/notes.

## Future automation

Any recommendation or automatic progression must be:

- based on explicit reviewed criteria;
- explainable;
- auditable;
- staff-overridable;
- separate from raw attendance/check-in evidence.
