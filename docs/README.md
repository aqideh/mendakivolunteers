# KELUARGA documentation

This directory is the project record for the KELUARGA — MENDAKI Volunteer App and its shared data boundary with MakLom.

**Last consolidated:** 24 September 2026

## Start here

- [KELUARGA + MakLom domain architecture](architecture/keluarga-maklom-domain-architecture.md) — canonical identity, ownership boundaries, overlaps and review flows.
- [Current system architecture](architecture/current-system.md) — concise description of the current staging architecture.
- [Recruitment, registration and event-operations model](architecture/recruitment-registration-event-operations.md) — FormSG -> MakLom lead flow and KELUARGA registration/event operations.
- [Development roadmap](development-roadmap.md) — next work and delivery sequence.
- [Known issues and technical debt](known-issues.md) — current limitations, migration watch-points and deferred cleanup.
- [Feature inventory](feature-inventory.md) — implemented surfaces and capabilities.

## Detailed architecture

- [Phase 1 foundation](architecture/phase-1.md) — original application identity, roles and security foundation.
- [Phase 2 content CMS](architecture/phase-2-cms.md) — opportunity/news publishing history.
- [Phase 3 YM Hub read model](architecture/phase-3-ymhub-read-model.md) — retained historical/future projection design; not a current runtime dependency.
- [Phase 4 volunteer pathways](architecture/phase-4-volunteer-pathways.md) — versioned pathway maps and publication controls.
- [Gamification and points](architecture/gamification.md) — ledger foundation; attendance-derived automation remains paused pending a MakLom-approved contribution rule.

## Operations and integration

- [Production handover](operations/production-handover.md) — release, migration and rollback procedure.
- [Launch/batch integration direction](operations/launch-readiness-and-batch-integration-direction.md) — historical decision record; later architecture decisions supersede YM Hub-as-current-runtime assumptions.
- [YM Hub field request](ymhub-field-request.md) — retained future integration reference, not a current launch dependency.

## Security

- [Threat model](security/threat-model.md)
- [SECURITY.md](../SECURITY.md)

## Documentation rules

1. Deployed code plus applied/committed database migrations determine whether a feature exists.
2. `core.volunteers.id` is the canonical volunteer person key shared by KELUARGA and MakLom.
3. KELUARGA owns volunteer-facing registration and live event operations.
4. Prospective-volunteer intake uses FormSG; MakLom owns lead review/conversion and the managed longitudinal profile.
5. MakLom approval is required before KELUARGA operational attendance becomes approved volunteer hours.
6. YM Hub is dormant future integration infrastructure unless a later decision explicitly reactivates it.
7. KELUARGA and MakLom authorization remain separate.
8. A foundation/schema is not described as an operationally complete feature when its staff UI/process is unfinished.
9. New user-visible features update the feature inventory, roadmap and relevant architecture document together.
10. Do not place credentials, personal data, private correspondence or commercial details in public repository documents.
