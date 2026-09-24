# YM Hub / Salesforce field request — dormant future integration reference

**Status:** retained for a possible future enterprise integration  
**Not a current KELUARGA launch dependency**

## Current architecture boundary

KELUARGA and MakLom currently operate without a live YM Hub/Salesforce dependency.

- KELUARGA owns volunteer-facing registration and Event Operations.
- MakLom owns lead review, longitudinal profiles and approved contribution hours.
- `core.volunteers.id` is the canonical person identity.
- Any future Salesforce/YM Hub identifier is external reconciliation metadata, not the primary app identity.

Do not implement current volunteer-facing features around the placeholders in this document.

## If integration is reactivated

Request API metadata rather than screen labels.

For each required object/field obtain:

- object label and API name;
- field label and API name;
- data type/length/nullability;
- uniqueness/external-ID configuration;
- relationship paths;
- picklist API values;
- mutability;
- update timestamp;
- deletion/merge/inactive behaviour;
- expected volume/update frequency;
- anonymised example records.

Likely future domains may include:

- volunteer/person identity;
- organisational programme/activity;
- registration/assignment;
- attendance/verified contribution outcome;
- optional referral outcome.

## Integration invariants

A future adapter must:

- run server-side;
- use least-privilege credentials;
- map to current canonical KELUARGA/MakLom domain names;
- attach external IDs to existing records;
- be idempotent and auditable;
- surface freshness/failure state;
- handle merges/deletions/corrections;
- not make current KELUARGA operation dependent on Salesforce availability.

This file is an integration-discovery aid only. It does not define current product ownership.
