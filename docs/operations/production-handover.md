# Production handover

**Last reviewed:** 24 September 2026

## Release model

- `main` is production.
- `staging` is the verification environment/branch for the current shared-platform migration work.
- Changes use reviewed branches/PRs and forward-only database migrations.
- Shared KELUARGA + MakLom schema changes must be rehearsed against current production contracts before promotion.

## Production platform

| Service | Production responsibility |
|---|---|
| GitHub | source, review and release history |
| Vercel | KELUARGA application hosting |
| Supabase | shared Auth/database platform for KELUARGA + MakLom |
| FormSG | prospective-volunteer intake |
| MakLom | separate Volunteer Management application using the shared Supabase platform |

Secrets remain in their managed environments. Do not place secret values in GitHub, documentation, tickets or chat.

## Database release rules

1. Use new forward migrations; never edit an applied migration.
2. Rebuild from migrations in validation before production promotion.
3. Run database/RLS regression tests.
4. Compare repository migration versions with the linked environment history.
5. Review every new shared table/RPC for grants, RLS and application ownership.
6. Treat KELUARGA and MakLom authorization as separate even when tables are shared.
7. Prefer expand/contract releases when application versions may overlap.

## Pre-production verification

Verify the release against the current architecture:

- public discovery and opportunity pages load;
- volunteer authentication/account flows work;
- direct KELUARGA registration and registration status work;
- confirmed registrations populate Event Operations correctly;
- event creation, rosters, walk-ins, check-in/out and reconciliation work;
- manual isolated/integrated event boundaries remain explicit;
- volunteer dashboard shows only approved contribution hours;
- staff roles enforce `admin`, `volteam`, `staff`, `volunteer_leader`;
- KELUARGA roles do not implicitly grant MakLom access;
- pathways, points and badges respect their role boundaries;
- no current volunteer-facing feature requires YM Hub/Salesforce.

For shared-platform changes, also verify:

- MakLom can resolve the same canonical `core.volunteers.id`;
- FormSG lead records remain separate until conversion;
- contribution candidates cannot self-approve from KELUARGA;
- review inboxes preserve source provenance.

## FormSG activation

When FormSG intake changes:

1. verify the production webhook endpoint and signature validation;
2. ensure the FormSG secret exists only in the server-side Supabase function environment;
3. submit a controlled test;
4. verify mapped fields in MakLom;
5. verify retry/idempotency behaviour;
6. confirm no canonical volunteer is created before deliberate conversion.

## Post-release verification

After production promotion:

- confirm Vercel deployment is READY and points to the expected `main` commit;
- verify public routes and volunteer sign-in;
- verify an authorized staff account and a restricted staff tier;
- review Supabase logs for new authorization/database errors;
- verify shared-schema reads from both KELUARGA and MakLom where affected;
- verify no unintended legacy/YM Hub runtime dependency was reintroduced.

## Rollback

For an application-only incident, restore the previous known-good deployment and revert through the normal review process.

Database migrations are not rolled back automatically. Prefer a forward-fix migration. Use database restore/PITR only for a confirmed data-loss incident with appropriate organizational approval.

Historical `phaseone` names and legacy tables are contracts/provenance, not evidence that an old architecture remains active.
