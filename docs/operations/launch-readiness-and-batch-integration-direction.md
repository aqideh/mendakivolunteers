# Launch and backend-integration direction — superseded decision record

**Original decision period:** September 2026  
**Status:** historical; superseded by the shared KELUARGA + MakLom architecture adopted 24 September 2026

Use these documents for current decisions:

- [Current system architecture](../architecture/current-system.md)
- [KELUARGA + MakLom domain architecture](../architecture/keluarga-maklom-domain-architecture.md)
- [Recruitment, registration and Event Operations model](../architecture/recruitment-registration-event-operations.md)
- [Development roadmap](../development-roadmap.md)

## What this record established

This decision moved KELUARGA away from an external-portal registration model and established that KELUARGA should own volunteer-facing registrations and Event Operations.

Those decisions remain valid.

## What has since changed

The following assumptions in the original record are superseded:

- KELUARGA no longer owns a separate prospective-volunteer recruitment/review workflow; FormSG feeds MakLom leads.
- MakLom is no longer merely a deferred/manual downstream destination; it is part of the shared Volunteer Management architecture.
- Approved contribution hours are no longer defined by an active YM Hub verification path; MakLom reviews KELUARGA contribution evidence.
- YM Hub/Salesforce is no longer an immediate launch or batch-integration priority.
- KELUARGA and MakLom now share one canonical volunteer UUID in the same Supabase data platform.

## Current integration direction

Current priority is to make the KELUARGA + MakLom workflow operational and reliable:

```text
FormSG -> MakLom lead review -> canonical volunteer identity
KELUARGA registration -> roster -> attendance -> contribution candidate
MakLom review -> approved contribution hours -> KELUARGA dashboard
```

Any future YM Hub/Salesforce synchronization is a separate downstream enterprise integration project and must attach to the current canonical identity rather than replace the present workflow.
