# KELUARGA documentation

This directory is the project record for the KELUARGA — MENDAKI Volunteer App.

**Last consolidated:** 16 September 2026

Start here when assessing what exists, what is planned, and what still needs attention.

## Product and delivery status

- [Feature inventory](feature-inventory.md) — what is implemented on `main`, grouped by volunteer, staff and platform capability.
- [Development roadmap](development-roadmap.md) — upcoming work, dependencies, decisions and sequencing.
- [Known issues and technical debt](known-issues.md) — confirmed defects, operational limitations, deferred work and regression watch-points.
- [Current system architecture](architecture/current-system.md) — system boundaries, data ownership, identity model and integrations.

## Detailed architecture

- [Phase 1 foundation](architecture/phase-1.md) — application identity, roles and security foundation.
- [Phase 2 content CMS](architecture/phase-2-cms.md) — opportunity and news publishing model.
- [Phase 3 YM Hub read model](architecture/phase-3-ymhub-read-model.md) — authoritative volunteer-data projection.
- [Phase 4 volunteer pathways](architecture/phase-4-volunteer-pathways.md) — versioned pathway maps and publication controls.
- [Gamification and points](architecture/gamification.md) — points ledger and YM Hub verification boundary.

## Operations and integration

- [Launch readiness and batch-integration direction](operations/launch-readiness-and-batch-integration-direction.md) — September 2026 integration decision record and rollout notes.
- [Production handover](operations/production-handover.md) — release, migration and rollback procedure.
- [YM Hub field request](ymhub-field-request.md) — requested source fields and mapping requirements.

## Security

- [Threat model](security/threat-model.md)
- [`SECURITY.md`](../SECURITY.md)

## Documentation rules

1. The deployed code and applied database migrations are the source of truth for whether a feature exists.
2. YM Hub remains authoritative for volunteer identity, registration, official attendance and verified volunteer hours. KELUARGA event-day attendance is an operational record until reconciled and verified downstream.
3. A feature is not described as live merely because a schema, prototype or roadmap item exists.
4. Intentional deferrals are recorded separately from bugs.
5. New user-visible features should update the feature inventory and roadmap in the same pull request.
6. Newly discovered unresolved defects should be logged in GitHub Issues and linked from `known-issues.md` when they are material or recurring.
7. Do not place credentials, personal data, private correspondence or commercial details in these public repository documents.
