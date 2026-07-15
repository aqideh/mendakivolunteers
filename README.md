# MENDAKI Volunteers

Volunteer-facing web application for MENDAKI. The application supplements YM Hub; it does not replace the CRM or become authoritative for volunteer registration, verified attendance, or verified hours.

## Delivery status

### Phase 1: platform and identity foundation

The `phase-1-foundation` implementation establishes:

- Next.js 16 and TypeScript web application shell.
- Supabase SSR authentication with one-time email links.
- Protected volunteer dashboard.
- Internal account and volunteer identity separation.
- Role-based authorization and forced Row Level Security.
- Account-link case model for ambiguous YM Hub matches.
- Append-only audit event foundation.
- Replaceable `YmHubGateway` interface and development mock adapter.
- Prototype IDs such as `PROTO-VOL-000001`.
- Production checks that reject mock mode and placeholder mappings.
- Unit, migration, RLS, dependency, and production-build CI checks.

### Phase 2: opportunity and news CMS

The `phase-2-cms` implementation adds:

- Public opportunity discovery and detail routes.
- YM Hub registration link-outs without app-owned registration records.
- Public volunteer news and announcement routes.
- A native staff CMS for opportunities and news.
- Draft, review, scheduled, published, and archived content states.
- Separate editor and publisher permissions.
- Database-enforced protection for live and scheduled content.
- Append-only revision snapshots and status-change audit events.
- Singapore-time CMS inputs stored as timezone-aware timestamps.
- Prototype content records for local development.
- pgTAP tests covering RLS, grants, revisions, and publisher-only operations.

The Salesforce YM Hub gateway is deliberately not implemented yet. Salesforce mode fails closed until the exact object and field API names are supplied and the integration is reviewed.

## Technology

- Next.js App Router and React.
- Supabase Auth and PostgreSQL.
- Supabase CLI migrations and pgTAP database tests.
- Vitest unit tests.
- GitHub Actions and Dependabot.

## Local setup

Requirements:

- Node.js 20.9 or later.
- Docker-compatible runtime for the local Supabase stack.

```bash
npm install
cp .env.example .env.local
npm run db:start
npm run db:reset
npm run dev
```

Run `npx supabase status -o env` after starting Supabase and copy the local project URL and publishable key into `.env.local`.

Open:

- Web app: `http://localhost:3000`
- Opportunities: `http://localhost:3000/opportunities`
- News: `http://localhost:3000/news`
- Content CMS: `http://localhost:3000/admin/content`
- Local email inbox: `http://127.0.0.1:54324`
- Supabase Studio: `http://127.0.0.1:54323`

After creating a local account, update the email in `supabase/snippets/link_mock_volunteer.sql` and run the snippet in the local SQL editor to link it to `PROTO-VOL-000001`.

To use the CMS locally, grant the linked test account `content_editor`, `publisher`, or `admin` in `core.user_roles`. Role changes are server-side administrative operations and are not exposed to the browser.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:audit
npm run db:test
```

`npm run db:test` requires the local Supabase stack to be running.

## Production guard

Deployment configuration must explicitly use:

```text
APP_ENV=production
YMHUB_CONNECTOR_MODE=salesforce
```

Before a production deployment, run:

```bash
npm run check:production
```

The check fails if required settings are missing or still contain `PROTO`, `PLACEHOLDER`, or bracketed field tokens. The runtime also rejects the mock connector in production.

## Project structure

```text
src/app                    Web routes, CMS routes, and authentication flow
src/components             Shared portal interface components
src/lib/auth               Server-side authorization helpers
src/lib/content            Content validation and Singapore-time utilities
src/lib/supabase           Browser, server, and session proxy clients
src/lib/ymhub              Canonical gateway, mock adapter, and placeholders
src/lib/security           Shared security validation
src/types/database.ts      Generated-style Supabase schema types
supabase/migrations        Versioned database schema and RLS
supabase/tests/database    pgTAP database security tests
docs/architecture          System design and source-of-truth boundaries
docs/security              Threat model and release controls
```

## Source-of-truth boundary

YM Hub remains authoritative for:

- Volunteer master identity.
- Registration and participation.
- Official attendance verification.
- Verified volunteer hours.

The web application owns its authentication, opportunity and news content, attendance capture and staff handoff records, points, badges, and referrals. Attendance-based rewards will only be issued after the app reads a verified downstream YM Hub record in a later phase.
