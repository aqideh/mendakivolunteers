# Phase 3 YM Hub read model — dormant historical design

**Status:** dormant historical/future integration reference  
**Not a current runtime dependency**

## Purpose of retention

This document records the earlier design for read-only YM Hub/Salesforce projections. The related `ymhub` and `integration.ymhub_*` objects may remain in the database for future reuse, but they do not define the current KELUARGA/MakLom operating model.

## Current boundary

YM Hub/Salesforce is not currently required for:

- canonical volunteer creation;
- KELUARGA registration;
- Event Operations;
- approved contribution-hour display;
- points input;
- the current KELUARGA -> MakLom workflow.

Current approved hours come from MakLom review of KELUARGA contribution evidence.

## If reactivated later

Any future enterprise integration should:

- run server-side only;
- attach external identifiers to the existing `core.volunteers.id` identity spine;
- use typed mappings and idempotent writes;
- expose explicit freshness/failure state;
- preserve auditability and exception handling;
- handle merges, deletions and corrections deliberately;
- never make volunteer-facing operation dependent on an external record.

The dormant projection schema should not be described as an active authoritative source until a real approved integration is operating.
