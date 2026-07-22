# Phase One Lite release plan

## Goal

Ship a mobile-first volunteer operations web app on Vercel, backed by Supabase, for a controlled Phase One release.

## Delivered product surfaces

### Public opportunities

- Upcoming MENDAKI opportunities imported from Volunteer.gov.sg.
- Title, image, summary, dates, venue and canonical registration URL.
- Registration remains on Volunteer.gov.sg.
- Protected daily Vercel Cron import at 08:17 Singapore time.
- Failed imports preserve the last successfully imported listings.

### Volunteer event access

- Staff-managed event details linked to an imported opportunity or standalone event.
- Reporting time, venue, briefing and WhatsApp links.
- Server-side PIN verification using salted scrypt hashes.
- Rate-limited PIN attempts.
- Short-lived, event-scoped HttpOnly access cookies signed with a dedicated `PIN_COOKIE_SECRET`.

### Staff event operations

- Supabase-authenticated `attendance_manager` and `admin` access.
- Event create, edit, publish and unpublish workflow.
- PIN rotation and protected sign-in/sign-out destinations.
- CSV roster preview, validation, merge and replace modes.
- Transactional roster imports with import audit history.

### Attendance counter-check

- Search and filter the event roster.
- Pending, signed-in, signed-out and anomaly states.
- Staff timestamp corrections with mandatory reasons.
- Atomic attendance updates and immutable before/after audit records.
- Protected CSV export for subsequent YM Hub entry or verification.

## Architecture boundaries

- Next.js App Router on Vercel.
- Supabase Auth for staff only.
- Supabase Postgres with RLS on exposed tables.
- Service-role operations remain server-only.
- Volunteers do not need accounts for this release.
- No YM Hub writes, points, badges, news feed, referrals or volunteer profiles.

## Required production environment variables

```text
APP_ENV=production
NEXT_PUBLIC_APP_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SERVICE_ROLE_KEY=
VOLUNTEER_GOV_SG_MENDAKI_URL=
CRON_SECRET=
PIN_COOKIE_SECRET=
AUTH_ALLOW_SIGN_UP=false
```

`PIN_COOKIE_SECRET`, `CRON_SECRET` and `SUPABASE_SERVICE_ROLE_KEY` must each contain at least 32 characters. The PIN cookie secret must not reuse the Supabase service-role key.

## Automated release evidence

- ESLint passes in GitHub Actions.
- TypeScript and Next.js route type generation pass.
- Unit tests pass.
- Production Next.js build passes.
- Supabase migrations rebuild successfully from scratch.
- Database/RLS tests pass.
- High-severity npm audit is enforced in a dedicated CI job.
- Vulnerable transitive `sharp` versions are overridden with `sharp@0.35.3` and committed in the lockfile.
- Vercel successfully builds the `phaseone` branch with explicit public Supabase configuration.

## Final operator checks

Before accepting the release:

1. Confirm all required environment variables are set for the Vercel Production environment.
2. Generate distinct random values for `CRON_SECRET` and `PIN_COOKIE_SECRET`.
3. Confirm the production branch policy intentionally points to `phaseone`; restore the normal production branch after acceptance.
4. Confirm Vercel deployment protection is configured as intended. Public volunteer routes must not require Vercel SSO at launch.
5. Run `npm run check:production` with the production environment values.
6. Trigger the opportunity importer once and confirm a successful `phaseone_import_runs` record.
7. Create a controlled test event and verify PIN entry, sign-in, sign-out, expiry and PIN rotation.
8. Test public and staff flows at 320 px, 375 px, 390 px and 768 px widths on Safari and Chromium.
9. Confirm keyboard navigation, visible focus, labels, error messages and minimum touch-target sizes.
10. Confirm the attendance CSV opens correctly and contains no spreadsheet formulas supplied by roster data.

## Release decision

Do not merge or expose the app publicly until CI is green and the operator checks above are signed off. Keep PR #12 in draft until those checks are complete.
