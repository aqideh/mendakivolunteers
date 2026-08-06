# Phase 4: Volunteer pathways

## Purpose

Volunteer Pathways gives volunteers a shared view of possible development roles
while keeping official volunteer identity, registration, attendance, and verified
hours in YM Hub.

The portal owns:

- The published pathway map.
- Draft and published pathway versions.
- Track, phase, stage, and role-option descriptions.
- Pathway publication and audit history.

The first release does not own an individual volunteer's pathway position. Every
volunteer is shown at the Explorer starting point until a separately reviewed
assignment workflow is introduced.

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

## Future volunteer positioning

A later delivery may add a staff-managed `pathways.volunteer_positions` history
using:

- `core.volunteers.id` as the volunteer key.
- The pathway map and exact version used for the assignment.
- A stable stage key rather than a display title.
- Effective and end timestamps, assigning staff member, reason, and notes.

The recommended rule is one active position per pathway track, allowing a
volunteer to progress differently across tracks. Explorer remains a calculated
default when no active position exists. Attendance or training records may be
linked as evidence later, but must not advance a position automatically without
an approved policy and staff confirmation.
