# Mantine UI migration plan — historical implementation plan

**Started:** 16 September 2026  
**Status:** retained as UI migration history; not a product/architecture source of truth

KELUARGA adopted Mantine incrementally for interactive primitives while preserving the existing Next.js architecture and product-specific visual language.

## Principles retained

- mobile-first and compact Event Operations;
- Server Components/server-side loading where appropriate;
- Mantine for reusable interactive controls rather than forced whole-app conversion;
- product-specific KELUARGA UI remains custom where that improves clarity;
- migration work must not change data ownership, authorization, attendance rules or integration architecture.

## Current architecture authority

For product/data/integration boundaries, use:

- `docs/architecture/current-system.md`
- `docs/architecture/keluarga-maklom-domain-architecture.md`
- `docs/security/staff-access-model.md`

Older references in this UI plan to YM Hub source-of-truth assumptions or superseded role models are not current requirements.

## Remaining UI rule

Future UI work should reuse established primitives where useful, remove obsolete CSS after replacement, and validate mobile, keyboard, focus, reduced-motion and event-day workflows before release.
