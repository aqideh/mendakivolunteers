# Phase One Lite release plan

## Goal

Ship a mobile-first volunteer operations web app on Vercel, backed by Supabase, for a weekend release.

## Product surfaces

### 1. Public opportunities

- Show upcoming MENDAKI opportunities from Volunteer.gov.sg as cards.
- Import title, image, summary, dates, venue and canonical Volunteer.gov.sg URL.
- Registration always links out to Volunteer.gov.sg.
- Refresh through a protected Vercel Cron route every six hours.
- Preserve the last successful import when Volunteer.gov.sg is unavailable.

### 2. Volunteer event page

- Staff-created event operations record linked to an imported opportunity or a standalone event.
- Show reporting time, venue, briefing link and WhatsApp group link.
- Hide sign-in and sign-out links until the volunteer supplies the event PIN.
- PIN verification occurs server-side; store only a salted scrypt hash.
- Successful verification creates a short-lived, event-scoped HttpOnly cookie.

### 3. Staff administration

- Supabase-authenticated staff only.
- Create and edit event operations records.
- Upload a CSV roster with volunteer ID, name and optional email/mobile fields.
- Set or rotate the event PIN.
- Update operational links.
- Mark sign-in and sign-out manually while preserving timestamps and the staff actor.

## Minimal architecture

- Next.js App Router on Vercel.
- Supabase Auth for staff only.
- Supabase Postgres with RLS on every table.
- No volunteer accounts in this release.
- No YM Hub writeback.
- No points, badges, news feed or volunteer profiles.
- No client-side service-role key.

## Tables

- `phaseone_external_opportunities`: imported Volunteer.gov.sg listings.
- `phaseone_events`: staff-managed operational details and PIN hash.
- `phaseone_roster`: uploaded event volunteer list.
- `phaseone_attendance`: sign-in/sign-out status and immutable timestamps.
- `phaseone_import_runs`: importer audit and failure diagnostics.

## Release sequence

1. Importer, schema and public cards.
2. Event details and PIN-gated links.
3. Admin event editor and CSV roster upload.
4. Attendance counter-check interface.
5. Mobile QA, accessibility, security checks and Vercel production configuration.

## Required environment variables

```text
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VOLUNTEER_GOV_SG_MENDAKI_URL=
CRON_SECRET=
PIN_COOKIE_SECRET=
```

## Release gates

- `npm run check` passes.
- Database tests cover anonymous public reads, staff-only writes and cross-event isolation.
- Service-role key is absent from browser bundles.
- PIN endpoints are rate-limited and never log the supplied PIN.
- CSV upload rejects unsupported headers and oversized files.
- Import failure does not delete previously published opportunities.
- Sign-in/sign-out timestamp changes are append-only or separately audited.
- Production Vercel deployment uses the `phaseone` branch until the release is accepted.
