# PostgREST retry storm: operating procedure (October 2026)

## Evidence
- Production: 4,637,684 PostgreSQL log entries on 6 Oct, 8,637,642 on 7 Oct, and 4,081,314 on 8 Oct (Singapore time).
- The repeated profile error began at 11:06:57 SGT on 6 Oct.
- Staged attendance identity resolution began repeating at 18:10:16 SGT on 7 Oct.
- Last matching error was seen at 11:20:40 SGT on 8 Oct.
- Migration 20261008032039 stopped the storm. Later migration
  20261008035534_historical_identity_contact_quarantine replaced the
  implementation with a stale function body containing SQLSTATE 40001.
- Repo migration 20261008115100 was not reflected in production history at
  the time of diagnosis; its one-time guard did not protect later changes.
- Production hotfix version 20261012030014 restores P0001 without changing
  the client-visible RPC signature or error envelope.

## Release and drift requirements
1. GitHub migrations are the canonical source for schema changes.
2. Direct changes to production functions are restricted to a documented
   incident repair, followed by the same migration in GitHub before the
   next unrelated schema deployment.
3. A release reviewer compares applied migration versions to the repository
   versions, and rejects out-of-order and unaccounted migrations.
4. Rebuild a test database using the entire committed migration chain.
5. Execute the post-migration database safety test
   supabase/tests/database/postgrest_conflict_safety.test.sql.
6. Separately test stale-version behaviour over real PostgREST HTTP requests
   in a disposable test environment matching production's PostgREST version.
7. Compare production function bodies and privileges to the approved release
   after database deployment. Do not treat a migration-history row alone as
   proof the live function is correct.
8. Staging is currently behind production; reconcile migrations before using
   it as a release gate. Avoid copying real volunteer personal data.

## Monitoring and incident response
- Target actionable notification within 10 minutes of sustained abnormal
  database error rates. Name a primary and backup technical responder.
- Monitor database errors and application-level conflict outcomes separately.
  Returning an expected conflict as data will not increase SQL error counts.
- Avoid repeated wide Logs Explorer queries, which inflate Logs Query usage.
- Production already uses an 8-second statement timeout and lock timeout
  on authenticator; these do not stop fast repeated transactions.
- When alerted, first inspect recent PostgREST errors and active backends;
  verify process IDs before ending a confirmed runaway session.
- If a single RPC is responsible, disable the corresponding admin action,
  then consider narrowly revoking its execution grant until repaired.
- A restore must use the last verified SAFE function body with non-retryable
  error handling, matching owner, grants, search path, and security mode.
- Do not deploy a new HTTP-200 conflict contract into an existing RPC:
  legacy browser tabs could misinterpret the response as success. Use a
  versioned RPC and compatible client deployment sequence instead.

## Outstanding work
- Validate an external monitor and notification delivery against a
  controlled incident and document weekend response coverage.
- Add the full PostgREST stale-version integration test and schema-drift
  preflight to the deployment workflow.
- Add per-operation conflict-rate counters if versioned structured
  outcomes are introduced.
