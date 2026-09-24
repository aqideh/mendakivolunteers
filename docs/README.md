# KELUARGA documentation

This directory is the project record for KELUARGA MENDAKI and its shared Volunteer Management data platform with MakLom.

**Last consolidated:** 24 September 2026  
**Current reference architecture:** KELUARGA staging

## Product mission

KELUARGA is the volunteer-facing application. It helps volunteers discover opportunities, register, prepare for deployments, participate in event operations and see recognised volunteer-development information.

MakLom is the higher-sensitivity Volunteer Management application. It reviews prospective-volunteer leads, maintains the managed longitudinal profile, resolves data-quality issues, approves contribution hours and supports cross-event staff intelligence.

Both applications use the same canonical person identity in Supabase while retaining separate authorization.

YM Hub/Salesforce is not a current runtime dependency. Any future organisational handoff is downstream of the KELUARGA + MakLom operating model.

## Canonical current-state documents

These documents define current behaviour and take precedence over historical phase records:

1. [KELUARGA + MakLom domain architecture](architecture/keluarga-maklom-domain-architecture.md)
2. [Current system architecture](architecture/current-system.md)
3. [Recruitment, registration and Event Operations model](architecture/recruitment-registration-event-operations.md)
4. [Feature inventory](feature-inventory.md)
5. [Development roadmap](development-roadmap.md)
6. [Known issues and technical debt](known-issues.md)
7. [Staff access model](security/staff-access-model.md)
8. [Threat model](security/threat-model.md)
9. [Production handover](operations/production-handover.md)

## Historical / dormant design records

These explain how the system evolved. They are not current sources of product ownership or integration authority:

- [Phase 1 foundation](architecture/phase-1.md)
- [Phase 2 CMS](architecture/phase-2-cms.md)
- [Phase 3 YM Hub read model](architecture/phase-3-ymhub-read-model.md)
- [Phase 4 pathways](architecture/phase-4-volunteer-pathways.md)
- [Launch/backend integration decision record](operations/launch-readiness-and-batch-integration-direction.md)
- [YM Hub field request](ymhub-field-request.md)

Where a historical document conflicts with a canonical current-state document, the current-state document wins.

## Core documentation rules

1. `core.volunteers.id` is the canonical person key shared by KELUARGA and MakLom.
2. KELUARGA owns volunteer-facing registration and live Event Operations.
3. Prospective-volunteer intake uses FormSG; MakLom owns lead review and deliberate conversion.
4. MakLom owns the staff-managed longitudinal profile and approves contribution hours.
5. KELUARGA operational attendance is evidence until MakLom approves the contribution record.
6. KELUARGA and MakLom authorization remain separate.
7. YM Hub is dormant future integration infrastructure unless a later approved decision explicitly reactivates it.
8. Legacy tables may be retained for provenance without being active sources of truth.
9. A schema/foundation is not documented as a completed operational feature until its UI/process is usable.
10. Material feature or architecture changes update the feature inventory, roadmap and relevant architecture record together.
11. Never place credentials, personal data, private correspondence or commercial details in public repository documents.
