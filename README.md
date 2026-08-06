# MENDAKI Volunteers

Volunteer-facing web application for MENDAKI. It supplements YM Hub; YM Hub remains authoritative for volunteer identity, registration, verified attendance, and verified hours.

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

- Public opportunity, news, and volunteer pathway pages.
- Volunteer journey pages with briefing, sign-in, and sign-out controls.
- Supabase-backed staff authentication and password setup.
- Staff content, pathway, event, roster, attendance, and account administration.
- Attendance CSV export with spreadsheet-formula neutralization.
- Supabase migrations, Row Level Security policies, and pgTAP database tests.
- Scheduled Volunteer.gov.sg opportunity import through Vercel Cron.
- Read-only YM Hub projection foundations; production Salesforce synchronization is not enabled.

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

## Project structure

```text
src/app                    Next.js routes and server actions
src/components             Shared application components
src/lib/auth               Server-side authorization helpers
src/lib/content            Content validation and time utilities
src/lib/phaseone           Deployed event and attendance domain
src/lib/pathways           Versioned volunteer pathway loading and validation
src/lib/supabase           Browser, server, and session clients
src/lib/security           Security and serialization helpers
src/lib/ymhub              Read-only YM Hub presentation invariants
supabase/migrations        Ordered production database migrations
supabase/tests/database    pgTAP database and RLS tests
docs                       Architecture, roadmap, and operations notes
```

See [docs/operations/production-handover.md](docs/operations/production-handover.md) for the release, migration, rollback, and handover procedure.
