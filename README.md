# KELUARGA

KELUARGA is MENDAKI's volunteer companion and event-operations web application. It supplements YM Hub; **YM Hub remains authoritative for volunteer identity, registration, official attendance, and verified volunteer hours.**

KELUARGA currently provides public volunteer content, staff event-day operations, volunteer-development tools, and read-only personal views of authoritative records imported from YM Hub.

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
- Passwordless volunteer sign-in and protected account dashboard.
- Read-only YM Hub registration, official attendance and verified-hours presentation when authoritative snapshots are available.
- Points UI and append-only gamification foundation based only on verified YM Hub attendance.
- Public volunteer Pathways skill tree.

### Staff-facing

- Role-gated content, pathway, staff-access and event administration.
- Multi-day events and multiple shifts/timeslots.
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
- Scheduled Volunteer.gov.sg opportunity import through Vercel Cron as a transitional source.
- Read-only YM Hub projection foundations and volunteer sync-state model.
- Controlled batch processing is the immediate YM Hub/Salesforce integration direction; direct production Salesforce synchronization is not enabled.

## System boundaries

KELUARGA's event-day attendance is an **operational record**, not automatically an official volunteering record. Staff may use it for event operations, reconciliation and downstream export, but official attendance and verified hours remain YM Hub-owned.

Likewise:

- roster check-in alone cannot award points;
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
VOLUNTEER_GOV_SG_MENDAKI_URL
CRON_SECRET
PIN_COOKIE_SECRET
APP_ENV=production
AUTH_ALLOW_SIGN_UP=false
```

Before promotion, run:

```bash
npm run check:production
```

Never commit environment files, service-role keys, cron secrets, or PIN-cookie secrets.

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
