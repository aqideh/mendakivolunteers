# Production handover

## Branch policy

`main` is the only production branch. All changes use a short-lived branch and a pull request into `main`.

Before merging:

1. Confirm the pull request contains no secrets or generated local environment files.
2. Require the web, security, and Supabase database CI jobs to pass.
3. Review the Vercel preview without performing production-data writes.
4. Obtain approval from a Tech department reviewer.
5. Merge into `main` and verify the resulting production deployment.

Direct pushes, force pushes, and branch deletion should be disabled for `main` through GitHub rules.

## Platform inventory

| Service | Production resource |
| --- | --- |
| GitHub | `aqideh/mendakivolunteers`, branch `main` |
| Vercel | Team and project `mendakivolunteers` |
| Supabase | Project `mendakivolunteers`, ref `glpdougaxlgaipqlzcbq`, Singapore region |
| Runtime | Node.js 24 |

Secrets remain in Vercel and Supabase. Do not copy secret values into GitHub, documentation, tickets, or chat.

## Database changes

Database changes must be additive and committed as ordered files under `supabase/migrations`.

Applied migration timestamps must never be renamed. Supabase compares the filename timestamp with the production migration-history table; changing an applied timestamp makes an old migration appear new.

Before release:

1. Start the local Supabase stack.
2. Run `npm run db:reset` to rebuild from migrations.
3. Run `npm run db:test` to verify grants and Row Level Security.
4. Compare repository migration versions with the production migration history.
5. Review new tables for Data API grants and RLS coverage.
6. Confirm every custom Data API schema is listed in `supabase/config.toml` and
   in the linked production project's exposed-schema configuration.

Avoid destructive or backwards-incompatible migrations in the same release as application code that depends on them. Use expand-and-contract changes across releases.

## Production verification

After a merge to `main`, verify:

- The Vercel production deployment is `READY` and references the merged `main` commit.
- Production domains resolve to that deployment.
- Public opportunity, news, journey, and volunteer pathway pages load.
- Staff login and authorization redirects behave correctly.
- Pathway managers can load the pathway editor and preview without exposing drafts
  to ordinary volunteers.
- Event administration and attendance pages load for authorized staff.
- The scheduled import route still requires its cron secret.
- Supabase logs contain no new authentication, API, or database errors.

## Rollback

For an application-only incident, restore the previous known-good Vercel production deployment, then revert the offending commit through a pull request.

Database migrations are not rolled back automatically. If a migration caused the incident, prefer a forward-fix migration. Use Supabase restore or point-in-time recovery only for a confirmed data-loss incident and with the appropriate organizational approval.

The historical `phaseone` identifiers in code and the database are deployed contracts, not active branch-policy references. Rename them only through an explicitly reviewed migration project.
