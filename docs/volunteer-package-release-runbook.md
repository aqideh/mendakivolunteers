# Volunteer package release runbook

## Release scope

This runbook covers the volunteer package feature introduced through the stacked pull requests below. A package is backed by one `phaseone_events` record and provides:

- an upcoming package listing and public package detail page;
- a briefing link released at a configured time;
- independent sign-in and sign-out destinations;
- independent PIN hashes, rotation timestamps, access cookies and rate-limit scopes;
- staff CMS controls inside the existing authenticated event-management area.

No volunteer account is required. Package destinations and PIN material remain server-only.

## Required merge order

Merge the stack from the bottom upward. Do not squash or merge a later pull request before its base has landed.

1. PR #22 — database foundation (`agent/package-foundation` → `phaseone`)
2. PR #23 — package list/navigation (`agent/package-list-navigation` → `agent/package-foundation`)
3. PR #24 — package detail and timed briefing (`agent/package-detail-briefing` → `agent/package-list-navigation`)
4. PR #25 — independent action PINs (`agent/package-action-pins` → `agent/package-detail-briefing`)
5. PR #26 — package CMS (`agent/package-cms` → `agent/package-action-pins`)
6. Release-hardening PR — final safeguards and runbook (`agent/package-release-hardening` → `agent/package-cms`)

After each merge, retarget the next pull request to the branch that now contains its base if GitHub does not update the stack automatically. Confirm that the final cumulative diff against `phaseone` contains the complete feature and no duplicated commits.

## Production prerequisites

Before deployment:

- all required Vercel production environment variables pass `npm run check:production`;
- `PIN_COOKIE_SECRET` is at least 32 characters and is distinct from `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET`;
- the production app URL uses HTTPS and public package routes are not blocked by Vercel Deployment Protection;
- staff sign-in is working for an `attendance_manager` or `admin` account;
- a rollback owner and release operator are identified;
- no production package is published until the database migration and application deployment are both complete.

## Database rollout

The package schema is introduced by:

```text
supabase/migrations/20260730093000_phaseone_package_foundation.sql
```

The migration:

- adds `briefing_available_at`;
- adds independent sign-in and sign-out PIN salt, hash and rotation timestamp columns;
- adds generated public-safe readiness flags;
- backfills both action PINs from the legacy event PIN;
- adds action-specific PIN-attempt auditing and rate-limit indexing;
- removes public Data API access to briefing destinations and action PIN material;
- retains a temporary legacy-write compatibility trigger.

### Pre-migration checks

1. Confirm the production migration list does not already contain `20260730093000`.
2. Export or record the current `phaseone_events` schema and count of records with `pin_hash is not null`.
3. Confirm each legacy configured PIN has a non-null `pin_salt`, `pin_hash` and usable `pin_updated_at` or timestamp fallback.
4. Confirm the application deployment containing package code is ready but not yet serving traffic that depends on the new columns.
5. Take the normal managed database backup or confirm point-in-time recovery coverage.

### Apply and verify

Apply the migration once through the approved production migration process. Do not paste ad hoc DDL into production.

Immediately verify:

```sql
select
  count(*) filter (where pin_hash is not null) as legacy_configured,
  count(*) filter (where has_sign_in_pin) as sign_in_configured,
  count(*) filter (where has_sign_out_pin) as sign_out_configured
from public.phaseone_events;
```

The three counts must match directly after backfill.

Verify public privileges:

```sql
select
  has_column_privilege('anon', 'public.phaseone_events', 'briefing_url', 'select') as anon_briefing_url,
  has_column_privilege('anon', 'public.phaseone_events', 'sign_in_pin_hash', 'select') as anon_sign_in_hash,
  has_column_privilege('anon', 'public.phaseone_events', 'sign_out_pin_hash', 'select') as anon_sign_out_hash;
```

All values must be `false`. Repeat for `authenticated`.

Verify the trigger and action constraint exist, then run the repository pgTAP suite against the migrated schema.

## Application deployment order

1. Complete and merge the stacked pull requests in order.
2. Apply and verify the database migration.
3. Deploy the cumulative `phaseone` application commit.
4. Confirm Vercel reports Ready and inspect build/runtime logs for package-route errors.
5. Keep all package records unpublished while smoke tests are performed.
6. Create or update one controlled package through the authenticated CMS.
7. Publish only the controlled package and complete the operator tests below.
8. Remove the controlled package or return it to draft after validation.

The migration must precede serving the cumulative package application because package routes select the new columns. The currently deployed legacy application remains compatible with the migrated schema through the temporary legacy PIN trigger.

## Operator test matrix

### Public listing and details

- `/packages` shows only published packages whose reporting date is today or later in Singapore time.
- Cards sort by reporting time and then ID.
- `/packages/[slug]` returns 404 for draft or unknown records.
- Package pages are marked `noindex` and do not expose briefing URLs, form URLs, PIN salts or PIN hashes in HTML, RSC payloads, browser logs or network JSON.
- `/events/[slug]` redirects to the package page without bypassing package access controls.

### Briefing

- No briefing configuration: disabled state and protected route returns unavailable.
- Future release time: disabled state and protected route does not reveal the destination.
- Release time reached: briefing opens the configured HTTPS destination.
- HTTP, malformed or removed destination: route refuses to redirect.
- Redirect response is non-cacheable and sends `Referrer-Policy: no-referrer`.

### Independent action PINs

For both sign-in and sign-out:

- malformed PIN receives 400;
- cross-origin or non-JSON verification receives 403 or 415;
- incorrect PIN receives 401 and records an unsuccessful attempt with the correct `action_type`;
- the sixth unsuccessful attempt inside 15 minutes receives 429;
- successful PIN receives an HttpOnly, Secure, SameSite=Lax five-minute action-specific cookie;
- sign-in cookie cannot open sign-out and sign-out cookie cannot open sign-in;
- external action redirects accept only HTTPS and suppress the referrer;
- rotating one action PIN immediately invalidates only that action cookie;
- clearing one action PIN disables only that action;
- legacy shared verification returns 410 and legacy action URLs pass through the new checks.

### Staff CMS

- unauthenticated and unauthorized users cannot open or submit the package editor;
- new package records start safely as drafts;
- Singapore-local reporting and briefing times persist as the expected UTC instants;
- briefing URL and release time must be supplied together;
- only HTTPS external URLs are accepted;
- publication is blocked without reporting time, both action URLs and both action PINs;
- existing PIN values are never returned to the browser;
- setting, rotating and clearing each PIN works independently;
- changes revalidate `/packages`, `/packages/[slug]` and legacy event routes.

### Responsive and accessibility checks

Test 320, 375, 390, 768 and desktop widths in Chromium and Safari where available:

- no horizontal overflow;
- both action panels remain readable and usable;
- controls retain at least 44 px touch targets;
- keyboard focus is visible;
- labels and error messages are announced correctly;
- disabled briefing state is distinguishable without relying on colour alone;
- no framework error overlay, console error or failed package request appears.

## Rollback

### Application rollback

If the cumulative application deployment fails after the migration:

1. roll Vercel back to the last known-good `phaseone` deployment;
2. leave the package migration in place;
3. keep package records unpublished;
4. investigate using Vercel runtime logs and the failed deployment commit.

The previous application is designed to continue operating after the migration because legacy event PIN writes are mirrored into both action PIN sets.

### Database rollback

Do not automatically reverse the migration after production data has been edited through the package CMS. Reversal would discard independent PIN state and briefing scheduling.

A database rollback is permissible only before any action-specific PIN has diverged from the legacy PIN and only with an approved backup/restore plan. Prefer restoring the pre-migration backup or point-in-time snapshot rather than running destructive manual `DROP COLUMN` statements.

If rollback is required after independent PINs have been used, preserve the database and roll back only the application while a forward fix is prepared.

## Release decision

Keep every pull request draft and do not publish production packages until:

- all stacked CI checks pass;
- the migration rebuild and pgTAP/RLS tests pass from scratch;
- Vercel is Ready for the cumulative commit;
- the controlled operator test matrix is signed off;
- the production migration verification queries pass;
- no sensitive destination or PIN material is visible to anonymous or authenticated Data API clients.
