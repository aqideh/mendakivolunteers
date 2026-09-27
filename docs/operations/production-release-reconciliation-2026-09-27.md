# Production release — 27 September 2026

## Authorization and scope

The user explicitly requested production promotion after being told that hosted interactive UAT remained incomplete. Release PR #216 integrates staging with all three production-only roster commits. The merge preserves manual roster volunteer creation, returning-volunteer database selection and dietary/T-shirt profile synchronization.

## Database rollout completed

Production Supabase: `glpdougaxlgaipqlzcbq`.

| Applied version | Change |
| --- | --- |
| 20260927031108 | Additive staff-role and recognition provenance enum values |
| 20260927031346 | Restore private-profile column privileges and Volunteer Team read policy after the production roster migration |
| 20260927031529 | Consolidated profiles, operations, geography and recognition forward release |

The production bridge `20260925015127_production_shared_architecture_bridge` was compared byte-for-byte with staging's `20260925073000_production_shared_architecture_bridge.sql`: identical, so it was **not replayed**. Existing canonical identity, MakLom lead conversion, contribution review, profile-change review and later roster functions were preserved.

The consolidated forward migration concatenates the following reviewed source migrations in order, stripping only their outer BEGIN/COMMIT. Before creating the Volunteer Team private-details policy it drops an existing policy of that name. At the end it reapplies `20260927031346_production_profile_privilege_reconciliation.sql`. The exact executed SQL is stored in the hosted migration history under version 20260927031529.

- `supabase/migrations/20260924161100_simplified_staff_role_model.sql` (blob `37f954f8a0ed5aa3eb60b12d7a21c70891ad60f2`)
- `supabase/migrations/20260925080000_keluarga_profile_passport.sql` (blob `cb80337f1b4be0efa3e6b74d9075f9997eeb1af1`)
- `supabase/migrations/20260925080500_event_image_storage.sql` (blob `3c5f52283f9a43b3f51e510121a03bb404e40128`)
- `supabase/migrations/20260925090000_profile_onboarding_journey.sql` (blob `61a8e7b2d1bbbe9cd14bb23e5f12cd009c8de4c5`)
- `supabase/migrations/20260925093000_private_profile_and_shirt_inventory.sql` (blob `50b4c343916555fa230c58d002c72704dfa49309`)
- `supabase/migrations/20260925094500_private_profile_access_hardening.sql` (blob `24ca605efd10f820faebbe030a553d5878a84a67`)
- `supabase/migrations/20260925095000_location_field_integrity.sql` (blob `cbd462aa094328d66452e8ceeea0330f7634b03d`)
- `supabase/migrations/20260925095500_shirt_issue_role_hardening.sql` (blob `c76d62e076939897253a06f2573d40a2d9114909`)
- `supabase/migrations/20260925100000_electoral_geography_2025.sql` (blob `f03879e494fb230d5ecc942c5c6822107342a703`)
- `supabase/migrations/20260925101500_onemap_home_location_rpc.sql` (blob `4dea2c9f0456223c75324cdb4312a1389b27fee7`)
- `supabase/migrations/20260925121000_phaseone_opportunity_workbook_import.sql` (blob `22ce8ffc2fcfaa3bf507fb357a88ee8cbbd3748d`)
- `supabase/migrations/20260925122500_phaseone_opportunity_workbook_import_service_boundary.sql` (blob `f93990c06b26ca22b5332d0396471544eaa47f47`)
- `supabase/migrations/20260925123500_index_phaseone_opportunity_imports.sql` (blob `e30bde48cb0b413f63f81d76d3d40754b7e4409b`)
- `supabase/migrations/20260925133000_phaseone_event_form_drafts.sql` (blob `4edc20e29b1a4a242299143502a03493d2061af0`)
- `supabase/migrations/20260925142500_event_card_photo_opt_in.sql` (blob `14e00700fe0e52a9ae00ccfeeade482c10a6203d`)
- `supabase/migrations/20260925145000_landing_page_media.sql` (blob `fe92f3e277f0c318e7e77ea5cba30c3f1c374455`)
- `supabase/migrations/20260925145500_landing_page_media_updated_by_index.sql` (blob `d5e3c1d52f7489dde40a97728ac1997f3a4d9610`)
- `supabase/migrations/20260925145600_registration_uses_profile_identity.sql` (blob `1b668cb7255883a73e6a4f560a92d85436437a1c`)
- `supabase/migrations/20260926164302_recognition_policy_v1.sql` (blob `0c2ca98a8315bbe1e568d7d716f95975724fdf2a`)

This is a production-specific rollout manifest. Do not blindly replay staging bootstrap or identity migrations, and do not treat the different hosted histories as identical.

## Verification

- Production forward migration rehearsed with ROLLBACK before application.
- Hash comparisons verified unchanged existing `core.volunteers`, `public.volunteers` and `public.volunteer_contributions` rows.
- Recognition fixture ran against the production schema plus the proposed migrations, then rolled back: pending attendance gave no points; 15 approved hours gave 220 points and two badges; correction to 10 hours gave 120 points and removed the 15-hour badge; weekly exploration was capped; monthly profile confirmation awarded 2 points.
- No synthetic fixture user remained after rollback.
- Post-migration baseline: 575 canonical volunteers; 574 MakLom profiles; zero unlinked profiles; six pending contributions; zero approved contributions.
- Three recognition rules active; 33 electoral boundaries installed; volunteer direct latitude update privilege denied.
- Web lint, type check, unit tests, production build and dependency audit passed on the integrated release.
- The first combined database CI identified an actual grant-order regression: the later production roster migration restored table-level UPDATE privileges on derived location fields. A new forward migration fixes the permissions; final CI is rerunning.
- Existing contribution approvals remain staff decisions. No real pending contribution was approved by the release.

## Application deployment

Pending final CI and merge of PR #216 into `main`. Vercel production builds enforce use of production Supabase through `scripts/check-environment-boundary.mjs`.

After merge, verify the production deployment commit and aliases, public route HTTP responses and runtime logs. Keep the previous production deployment `dpl_5HssbMv5bgqPFKKLnfHmDfTJBog4` available for application rollback; database changes are additive and no existing volunteer data was replaced.

## Remaining operational verification

The connector-based deployment checks do not establish a signed-in volunteer → MakLom reviewer → volunteer-profile browser journey. Hosted interactive UAT remains open. OneMap credential activation and physical opening shirt stock remain operational setup items.
