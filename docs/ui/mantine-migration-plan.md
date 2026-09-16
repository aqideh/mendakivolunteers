# Mantine UI migration plan

**Started:** 16 September 2026

KELUARGA will adopt Mantine incrementally. Mantine is a component toolkit inside the existing KELUARGA design system; it is not a wholesale redesign or replacement for product-specific UI.

## Principles

- Preserve the current mobile-first, compact KELUARGA visual language.
- Keep Server Components and server-side data loading where they already work well.
- Use Mantine primarily for interactive client-side controls and common UI primitives.
- Do not convert a working custom component merely to increase Mantine coverage.
- Remove obsolete bespoke CSS as migrated primitives replace it.
- Keep each migration step independently reviewable and deployable.

## Step 1 — foundation

**Status:** complete on `mantine-step-1-foundation`.

- Add `@mantine/core` and `@mantine/hooks`.
- Add the root `MantineProvider` and required stylesheet / color-scheme setup.
- Add a KELUARGA theme aligned to the existing brand colours, typography and radius scale.
- Enable Next.js package-import optimisation.
- Do not migrate any existing page controls yet.

Exit criteria: existing application behavior remains unchanged and lint, type-check, tests, production build, dependency audit and database tests pass.

## Step 2 — KELUARGA primitives

**Status:** in progress on `mantine-step-1-foundation`.

Create a small, opinionated application layer for the Mantine components we intend to use repeatedly. Initial targets:

- buttons and action icons;
- text, number and select inputs;
- checkboxes and switches;
- badges / status indicators;
- alerts;
- modal and drawer patterns;
- menus;
- loading / empty / error states.

The application layer should encode KELUARGA sizing and density so individual pages do not independently configure Mantine styling.

Exit criteria: shared primitives are documented, accessible, compact on mobile and visually compatible with the existing interface.

## Step 3 — small staff workflows

Migrate self-contained interactive workflows before large pages:

- walk-in volunteer editing;
- add volunteer insight;
- volunteer review;
- other small event-management forms where Mantine reduces custom form CSS.

Keep existing Server Actions, validation and database behavior unchanged.

Exit criteria: migrated workflows have equal or better mobile usability and no attendance/identity regression.

## Step 4 — Event Operations controls

Migrate the reusable controls around staff event operations:

- filters and search;
- shift selection;
- status controls and badges;
- overflow/action menus;
- drawers/modals used for secondary actions;
- compact tabular/list controls where appropriate.

Do not force roster cards or operational layouts into Mantine `Card` components if the existing flat layout is clearer.

Exit criteria: event-day controls remain fast and compact, including on narrow mobile screens.

## Step 5 — administration surfaces

Apply the established primitives to:

- event configuration;
- content administration;
- pathways administration;
- staff/account management;
- reporting and reconciliation controls.

Prefer shared patterns over page-specific component styling.

## Step 6 — selective volunteer-facing adoption

Adopt Mantine only where it improves usability or consistency on volunteer pages. Preserve custom treatment for:

- KELUARGA branding and header presentation;
- Event Guides;
- Pathways / skill-tree visualisation;
- opportunity presentation where bespoke visual treatment is meaningful;
- product-specific motion and interaction.

Volunteer-facing pages should remain lean and server-rendered where possible.

## Step 7 — CSS consolidation

After migrated components are stable:

- identify unused selectors;
- remove duplicated button/form/status styles;
- consolidate responsive rules;
- preserve product-specific CSS;
- verify focus, reduced-motion and touch states.

CSS deletion happens only after the relevant page migration is complete.

## Step 8 — hardening

Before declaring the migration complete:

- mobile QA on representative event-day workflows;
- keyboard and focus-order review;
- screen-reader label review;
- reduced-motion verification;
- bundle / client-boundary review;
- production build and dependency audit;
- attendance, multi-shift and walk-in regression testing.

## Explicit non-goals

- No whole-app `AppShell` rewrite at the foundation stage.
- No automatic conversion of every layout element to Mantine.
- No changes to Supabase schemas, attendance rules or YM Hub source-of-truth boundaries as part of the UI migration.
- No visual redesign of KELUARGA unless separately proposed and approved.
