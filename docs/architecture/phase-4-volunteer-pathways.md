# Phase 4: Volunteer pathways

## Purpose

Volunteer Pathways gives volunteers a shared view of possible development roles. KELUARGA now owns the volunteer-facing recruitment and registration journey; YM Hub remains the authoritative backend organisational record and source for verified attendance/hours after handoff.

The portal owns:

- The published pathway map.
- Draft and published pathway versions.
- Track, phase, stage, and role-option descriptions.
- Pathway publication and audit history.

KELUARGA now also owns staff-confirmed individual pathway positions. Explorer remains the calculated default when a volunteer has no active position on a track.

## Routes

Volunteer route:

- `/pathways`

Staff routes:

- `/admin/pathways`
- `/admin/pathways/[versionId]/preview`

The home page, primary navigation, and authenticated dashboard link to Pathways.
The dashboard exposes pathway management only to `pathway_manager` and `admin`
roles.

## Version model

The `pathways` schema contains:

- `pathways.maps`
- `pathways.map_versions`
- `pathways.phases`
- `pathways.tracks`
- `pathways.stages`
- `pathways.stage_roles`

A map has one active published version and at most one open draft through the
application workflow. Published versions are immutable. Publishing validates the
complete four-track by five-phase grid, switches the active version in one
transaction, and archives the previous published version.

The first editor deliberately preserves the four tracks and five phases. Staff
can edit labels, descriptions, ordering, approved colour tokens, stage titles,
and one to three structured role options per stage.

## Authorization

`pathway_manager` and `admin` may create, edit, preview, and publish pathway
drafts. Browser clients receive no direct write privileges on pathway tables;
all writes use role-gated PostgreSQL functions.

Anonymous and authenticated volunteers can select only the active published
version and its child records. Staff managers can also read drafts and archived
versions. All exposed tables use forced Row Level Security.

## Audit and history

Each version insert and status change writes an event to the central
`audit.events` table. Historical versions are retained. A published version can
only transition to `archived`; its content and child records cannot be changed or
deleted.

## Volunteer positioning

`pathways.volunteer_positions` retains staff-confirmed pathway history using:

- `core.volunteers.id` as the stable KELUARGA volunteer key;
- the pathway map and exact published version used for assignment;
- stable track and stage keys plus display snapshots;
- effective/end timestamps, assigning staff member, reason, and optional notes.

One active position is allowed per pathway track, so a volunteer can progress differently across tracks. Assigning the exact same active stage is idempotent; assigning a different stage on the same track closes the previous position rather than overwriting history. Explorer remains the calculated default when no active position exists. Attendance, registrations and points do not advance a pathway position automatically.

Personal UI reads use the account-scoped `core.get_current_pathway_positions_snapshot()` security-definer function, which resolves the signed-in volunteer internally and emits only volunteer-safe position fields. The expand release also changes direct table RLS to self-only while temporarily retaining the authenticated `SELECT` grant so the previously deployed app remains compatible during rollout. After the RPC-based app is live, a follow-up contract migration removes direct browser `SELECT` entirely because the history rows also contain staff reasons, notes and actor identifiers. Staff listing remains server-side and role-gated.
