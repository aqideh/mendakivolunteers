# Phase 2 CMS — historical record

**Status:** historical implementation record  
**Current content/event model:** see [Current system architecture](current-system.md) and [Feature inventory](../feature-inventory.md)

## Why this document remains

Phase 2 introduced app-owned opportunity/news publishing, revision history and content-security controls. It originally assumed external registration links and a separate CMS opportunity model.

That registration and opportunity architecture is no longer current.

## Foundations retained

- KELUARGA owns volunteer-facing content and news.
- Staff content actions remain role-gated and server-validated.
- Published content is separated from draft/review state.
- Revision/audit history should be preserved.
- Content timestamps are handled in a timezone-aware manner.
- Browser clients do not receive privileged credentials.

## Superseded behaviour

The following Phase 2 assumptions are historical:

- opportunity registration through external links;
- `content.opportunities` as the canonical live opportunity source;
- required external registration URLs;
- Volunteer.gov.sg/imported-card driven discovery.

For new operations, KELUARGA programme/event records and their publication controls drive opportunities, registrations, Event Guides and Event Operations.

Retained CMS tables may remain for provenance until an explicit migration/retention decision.
