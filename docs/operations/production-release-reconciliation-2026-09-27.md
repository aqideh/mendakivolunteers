# Production reconciliation and end-to-end UAT — 27 September 2026

**Release candidate:** KELUARGA `staging` at `2b7457f2c23699f98ffe4662334d50e0e598c8e0`  
**Production code:** `main` at `6a577c9b30d8bb612c56e600c351b0ccf03b1141`  
**Production database:** `glpdougaxlgaipqlzcbq`; **staging database:** `nbnglontqrxywppmmhfm`.

## Decision

Production promotion is **pending**. The release must be cut from a reviewed production change set; `staging` is 204 commits ahead and 3 behind `main` (172 differing files, including 34 migration files). The live application uses `main`, and recognition UI is on `staging` only. Merging all 204 commits or replaying all 34 staging migrations would cross different database histories without a verified release path.

## Verified baseline

| Boundary | Production | Staging | Result |
| --- | --- | --- | --- |
| Vercel | Production deployment `dpl_5HssbMv5bgqPFKKLnfHmDfTJBog4` READY; `/opportunities` responded HTTP 200 | Recognition deployment `dpl_UAtgDGas2abSYrPKqpZssLrQmUFg` READY | Deployed code identified |
| Hosted page | Public opportunities page responded | Stable staging URL responded HTTP 302 to Vercel SSO | Browser volunteer journey not observed |
| Identity | 575 canonical volunteers; 574 MakLom profiles, all 574 linked | 4 canonical volunteers; 3 MakLom profiles | One additional production canonical record since 25 September rehearsal; refresh release invariant |
| Staff roles | 4 admin, 10 volunteer; no legacy staff assignments | Separate test roles | Simplified role guard can be checked again at release |
| KELUARGA attendance | 88 sessions with checkout; 6 have both timestamps and a linked roster volunteer | No approved contribution | All 6 eligible production sessions have contribution rows |
| MakLom contribution review | 6 pending, 0 approved | 0 approved | Real reviewer approval and correction UAT remains open |
| Recognition database | Recognition v1 migrations absent | Recognition v1 migrations applied | Production badges/points cannot be exercised yet |

These are aggregate snapshots, not a historical-hours decision. Existing MakLom `attendance_log` rows need separate evidence review before recognition eligibility.

## Database verification completed

In staging, a **rollback-only** transaction based on `supabase/tests/database/recognition_policy_v1.test.sql` created a synthetic volunteer, shift, linked roster and checked-out attendance session. It asserted that:

1. A 900-minute MakLom approval creates 220 points (150 hours points + 20 first approval + 50 for 15 hours) and the First Step and Helping Hand badges.
2. Correcting the approved minutes to 600 produces a 120-point balance and revokes the 15-hour badge.
3. The transaction rolled back. No synthetic fixture remains.

The prior CI run for the recognition merge passed its web build, audit and database tests. This SQL verification proves the database boundary only; it does not prove the browser, authentication, staff review UI or profile rendering on the hosted staging deployment.

## Release preparation

1. Create a production branch from current `main` and bring over an explicitly reviewed feature set. Preserve the three production-only commits and do not merge `staging` wholesale.
2. Compare every candidate migration against **both** hosted migration histories. Production already has `20260925015127_production_shared_architecture_bridge`, `20260925015229_maklom_contribution_review_surface`, `20260925022331_maklom_profile_change_review` and later roster migrations. The similarly purposed `20260925073000_production_shared_architecture_bridge.sql` exists in staging Git but is absent from both hosted migration histories. Inspect its function/trigger definitions against production before deciding which pieces, if any, need a new forward migration. Do not apply bootstrap migrations to replace production's canonical MakLom identity.
3. Re-run a rollback-only production migration rehearsal against the **current** 575/574 identity baseline and six pending contributions. Require unchanged KEL codes, linked profile count, existing profile provenance, MakLom membership rules and pending contribution rows.
4. Apply only verified forward migrations, run database/RLS tests and Supabase advisors, then deploy the reviewed `main` commit. Check production environment variables still target `glpdougaxlgaipqlzcbq`.
5. Check the volunteer dashboard, approved hours, ledger, badges and runtime errors immediately after the deployment. A production approval must remain a real MakLom reviewer decision; do not mark the six pending records approved as a deployment test.

## End-to-end UAT to finish before promotion

Use a synthetic volunteer and staff reviewer in staging:

| Step | Evidence to capture | Pass condition |
| --- | --- | --- |
| FormSG lead and MakLom conversion | Lead ID, canonical KEL code, linked MakLom profile | One identity, no duplicate conversion |
| KELUARGA registration and roster | Event, timeslot and roster link | Volunteer sees registration and staff sees linked roster |
| Check-in and checkout | Session and generated contribution ID | Contribution starts pending; no volunteering points yet |
| MakLom approval of 60 minutes | Review audit and volunteer profile | 10 hour points + 20 first bonus; First Step badge; 1 approved hour |
| Adjustment and reversal | Audit, point ledger and badge history | Net balance and approved hours agree; badges change at crossed threshold |
| Opportunity and profile review | Capped engagement ledger | 2 points weekly per published opportunity exploration and 2 monthly for explicit profile confirmation |
| Cross-account authorization | Second volunteer and non-review staff session | No cross-volunteer profile access and no unauthorized approval |

The hosted staging site currently redirects an unauthenticated fetch to Vercel SSO. Completing these browser steps requires authenticated staging volunteer and MakLom reviewer sessions. The live production approval queue contains six real pending items; staff must review them under the normal policy.

## Go/no-go evidence

Promotion is ready only after the current production migration rehearsal, hosted staging journey above, reviewed `main` release diff, CI/RLS gates and safe database-first deploy sequence all pass. Record actual commit, migration versions, reviewer UAT evidence and post-deployment counts here when complete.
