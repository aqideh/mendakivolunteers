# Phase 1 architecture — historical record

**Status:** historical implementation record  
**Superseded for current architecture by:** [Current system architecture](current-system.md) and [KELUARGA + MakLom domain architecture](keluarga-maklom-domain-architecture.md)

## Why this document remains

Phase 1 established the original secure KELUARGA foundation: Supabase Auth, canonical volunteer UUIDs, role-backed authorization, RLS and audit controls. Those foundations remain relevant, but the product boundary has since changed substantially.

Do not use this document to determine current recruitment, attendance-hour ownership, MakLom integration or YM Hub runtime behaviour.

## Foundations retained

- `auth.users.id` identifies the authenticated account.
- `core.volunteers.id` is the canonical internal person UUID.
- `core.volunteers.volunteer_code` is the immutable human-facing `KELxxxxx` identifier.
- Volunteers may exist before any external enterprise-system record exists.
- Browser clients do not control canonical identity links or privileged role grants.
- RLS, server-side authorization and append-only audit records remain core security controls.
- Secrets remain server-side.

## Current architecture changes since Phase 1

The current model is:

- KELUARGA owns volunteer-facing opportunity registration and live Event Operations.
- Prospective-volunteer intake uses FormSG.
- MakLom owns lead review/conversion, the managed longitudinal profile and approved contribution hours.
- KELUARGA and MakLom share `core.volunteers.id` but keep separate authorization.
- YM Hub/Salesforce is dormant future downstream integration infrastructure, not a current runtime prerequisite.

Historical references in older Phase 1 material to KELUARGA-owned recruitment review, YM Hub-owned current hours, or a required Salesforce adapter are superseded.
