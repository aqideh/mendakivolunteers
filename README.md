# KELUARGA

KELUARGA is MENDAKI's volunteer-facing registration and event-operations web application. Prospective volunteers begin through FormSG; MakLom manages the resulting lead review, longitudinal volunteer profile and approved contribution records. KELUARGA and MakLom share one canonical volunteer identity while retaining separate application permissions. YM Hub integration is dormant future infrastructure rather than a current KELUARGA runtime dependency.

KELUARGA provides public volunteer content, app-owned recruitment and registration workflows, staff event-day operations, volunteer-development tools, and read-only views of verified backend records where appropriate.

## Production ownership

- GitHub repository: `aqideh/mendakivolunteers`
- Production branch: `main`
- Hosting: Vercel project `mendakivolunteers`
- Backend: Supabase project `mendakivolunteers` in `ap-southeast-1`
- Supabase project ref: `glpdougaxlgaipqlzcbq`
- Runtime: Node.js 24

Only `main` may deploy to production. Development must use short-lived branches and pull requests. Vercel previews are for review; merging an approved pull request into `main` is the production release action.

The `phaseone` name remains in some routes, modules, CSS classes, tables, and migrations because it is part of the deployed application and database contract. Do not rename those identifiers as branch cleanup; a rename requires a separately planned API and database migration.

## Current capabilities

### Volunteer-facing

- Public landing page, opportunities and news.
- Event Guides with venue, directions, briefing, programme information and shift details.
- Passwordless volunteer sign-in/sign-up with automatic immutable `KELxxxxx` volunteer IDs, a protected account dashboard and audited self-service name/mobile editing.
- KELUARGA-owned programme/event records are the canonical source for opportunity discovery, shift selection, registrations, Event Guides and Event Operations.
- Volunteers can register directly in KELUARGA and see pending/confirmed/waitlisted/rejected status plus in-app registration updates.
- Read-only YM Hub attendance and verified-hours presentation when authoritative snapshots are available.
- Points UI and append-only gamification ledger with separate verified-attendance and audited staff-recognition sources.
- Staff-defined, audited volunteer badges with reversible active awards.
- Staff-confirmed personal pathway positions with one active position per track and retained history.
- Public volunteer Pathways skill tree.

### Staff-facing

- Role-gated content, pathway, staff-access, points-management and event administration.
- Staff registration review with Confirm, Waitlist and Reject actions; confirmed registrations populate Event Operations directly.
- Multi-day events and multiple shifts/timeslots with optional per-shift registration capacity.
- CSV/pasted roster import, roster templates and optional Volunteer ID.
- Walk-in/last-minute volunteers, dietary requirements and contact corrections.
- Check-in/check-out, absent/withdrawn states, audited corrections and bulk checkout.
- Continuous attendance across adjacent shifts and spontaneous shift extensions.
- Live attendance monitor and reconciliation view.
- QR attendance/feedback foundation.
- Attendance and event-report exports.
- Volunteer Insights with staff review/accept/dismiss workflow.
- Volunteer Reviews with 1–5 event-role performance rating, behaviour tags, comments and follow-up flags.
- Event reporting combining roster, attendance, insights, reviews and volunteer feedback.

### Platform and integration

- Supabase migrations, Row Level Security policies and pgTAP database tests.
- GitHub Actions validation for lint, type checking, tests, builds, dependency audit and database checks.
- KELUARGA-owned programme/event records drive public opportunity discovery, Event Guides and Event Operations.
- Read-only YM Hub projection foundations and volunteer sync-state model remain for backend reconciliation and verified records.
- The KELUARGA -> YM Hub backend handoff is being designed separately by Volunteer Management; direct production Salesforce synchronization is not enabled.

## System boundaries

KELUARGA owns the live recruitment, registration and event-operations workflow. Event-day attendance remains an **operational record** until the agreed backend handoff/reconciliation is completed; verified volunteer hours remain YM Hub-owned.

Likewise:

- roster check-in alone cannot award points;
- manual staff-recognition points remain distinct from verified-attendance points and do not create YM Hub attendance records;
- `attendance_person_key` is an event-level continuity key, not a canonical organisation-wide volunteer ID;
- Volunteer Insights and Reviews do not automatically overwrite a central volunteer profile;
- automatic MakLom handoff is currently deferred.

## Project documentation

Start with [docs/README.md](docs/README.md).

Key project records:

- [Feature inventory](docs/feature-inventory.md) — implemented capability on `main`.
- [Development roadmap](docs/development-roadmap.md) — upcoming work, dependencies and sequencing.
- [Known issues and technical debt](docs/known-issues.md) — confirmed bugs, limitations, deferred work and regression watch-points.
- [Current system architecture](docs/architecture/current-system.md) — data ownership, identity, integrations and architecture invariants.
- [Recruitment, registration and event-operations operating model](docs/architecture/recruitment-registration-event-operations.md) — the September 2026 target workflow and handoff boundaries.
- [Launch and batch-integration decision record](docs/operations/launch-readiness-and-batch-integration-direction.md).
- [Production handover](docs/operations/production-handover.md).
- [Threat model](docs/security/threat-model.md).

When adding a material user-visible feature, update the feature inventory and roadmap in the same pull request. Confirmed material defects should be tracked as GitHub Issues and reflected in the known-issues register where useful.

## Local setup

Requirements:

- Node.js 24.
- npm 10 or 11.
- A Docker-compatible runtime for the local Supabase stack.

```bash
npm ci
cp .env.example .env.local
npm run db:start
npm run db:reset
npm run dev
```

Run `npx supabase status -o env` after starting Supabase and copy the local project URL and publishable key into `.env.local`.

Useful local URLs:

- Application: `http://localhost:3000`
- Supabase Studio: `http://127.0.0.1:54323`
- Local email inbox: `http://127.0.0.1:54324`

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:audit
npm run db:test
```

`npm run db:test` requires the local Supabase stack. Pull requests and `main` are also validated by GitHub Actions.

## Production configuration

Production must provide these environment variables through Vercel:

```text
NEXT_PUBLIC_APP_URL
NEXT_PUBLIC_SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
SUPABASE_SERVICE_ROLE_KEY
PIN_COOKIE_SECRET
APP_ENV=production
```

Before promotion, run:

```bash
npm run check:production
```

Never commit environment files, service-role keys, or PIN-cookie secrets.

<!-- Deployment retry: 2026-09-21 -->

## Project structure

```text
src/app                    Next.js routes and server actions
src/components             Shared application components
src/lib/auth               Server-side authorization helpers
src/lib/content            Content validation and time utilities
src/lib/gamification       Points presentation/read model
src/lib/phaseone           Deployed event and attendance domain
src/lib/pathways           Versioned volunteer pathway loading and validation
src/lib/supabase           Browser, server, and session clients
src/lib/security           Security and serialization helpers
src/lib/ymhub              Read-only YM Hub presentation invariants
supabase/migrations        Ordered production database migrations
supabase/tests/database    pgTAP database and RLS tests
docs                       Product, architecture, roadmap, security and operations records
```
