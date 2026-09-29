# KELUARGA staging environment

## Purpose

The `staging` Git branch and all Vercel Preview deployments are non-production environments. They must use the isolated **Keluarga Staging** Supabase project and must never connect to the production Supabase project.

## Supabase projects

| Environment | Project ref | Purpose |
|---|---|---|
| Production | `glpdougaxlgaipqlzcbq` | Live KELUARGA + shared MakLom data platform |
| Staging | `nbnglontqrxywppmmhfm` | Synthetic/test data only |

Staging public configuration:

```text
NEXT_PUBLIC_SUPABASE_URL=https://nbnglontqrxywppmmhfm.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_9Go2l1AUT8cwl-QukDDsAg_UWhr842J
APP_ENV=staging
AUTH_ALLOW_SIGN_UP=true
```

Do not commit `SUPABASE_SERVICE_ROLE_KEY` or `PIN_COOKIE_SECRET`.

## Vercel configuration

Configure the **Preview** environment in the KELUARGA Vercel project with:

- `NEXT_PUBLIC_SUPABASE_URL` — staging URL above.
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` — staging publishable key above.
- `SUPABASE_SERVICE_ROLE_KEY` — obtain from the **Keluarga Staging** Supabase project and store only as an encrypted Vercel environment variable.
- `PIN_COOKIE_SECRET` — a staging-only random secret of at least 32 characters. Do not reuse the production secret.
- `APP_ENV=staging`.
- `AUTH_ALLOW_SIGN_UP=true`.

`NEXT_PUBLIC_APP_URL` may be omitted for Vercel Preview deployments. The `staging` branch is canonicalised in application code to `https://keluargastaging.vercel.app`, including authentication callbacks. Other feature/PR previews continue to use their stable Vercel branch URL and fall back to the individual deployment URL when needed.

The legacy staging branch alias (`https://mendakivolunteers-git-staging-mendakivolunteers.vercel.app`) is compatibility-only. Browser requests to it receive a `307` redirect to the canonical staging hostname. The redirect preserves application query parameters such as `next`, `token_hash`, `type`, filters and dates, while removing Vercel's `_vercel_share` parameter before crossing to the canonical origin.

Cookies are origin-scoped and cannot be migrated between these two hostnames. A tester who previously authenticated on the legacy branch alias must sign in once on `keluargastaging.vercel.app`; subsequent sessions should remain on the canonical hostname.

Keep **Production** environment variables pointed at production.

## Hosted Supabase Auth configuration

Repository `supabase/config.toml` configures local Supabase development only. It does not change the hosted staging project's Authentication settings.

For **Keluarga Staging** (`nbnglontqrxywppmmhfm`), configure Authentication → URL Configuration as follows:

- **Site URL:** `https://keluargastaging.vercel.app`
- **Redirect URLs:** explicitly allow `https://keluargastaging.vercel.app/**`. Keep `https://*-mendakivolunteers.vercel.app/**` only for deliberate feature/PR preview authentication; the `staging` branch itself must return to the canonical staging hostname.
- Keep localhost redirect URLs only for deliberate local-development use; localhost must never be the hosted staging Site URL.

The hosted email template must also mirror `supabase/templates/magic_link.html`. In particular, the link must route to `{{ .RedirectTo }}` with `token_hash={{ .TokenHash }}` and `type=email`, so KELUARGA's `/auth/confirm` page verifies the token and completes account provisioning. Do not use the default direct Supabase `/verify` confirmation link for this flow.

External systems, callbacks and webhooks must use their intended canonical endpoint directly. Do not configure integrations against the legacy Vercel staging branch alias and rely on its `307` browser redirect; some non-browser clients do not follow redirects consistently. FormSG ingestion remains outside this alias path and should continue using its configured Supabase/MakLom endpoint.

## Build-time safety gate

`scripts/check-environment-boundary.mjs` runs before every build.

It rejects:

- a Vercel Preview deployment connected to production Supabase;
- the `staging` branch connected to any Supabase project other than Keluarga Staging;
- a Vercel Production deployment connected to anything other than production Supabase.

This is a hard safety boundary, not a convention.

## Release workflow

```text
feature branch
   ↓
Preview deployment → Staging Supabase
   ↓
merge to staging
   ↓
staging verification
   ↓ explicit approval
merge approved commit to main
   ↓
Production deployment → Production Supabase
```

Normal development should target `staging`. Production releases are explicit.

## Data rules

- Never copy real volunteer PII into staging.
- Use synthetic accounts and records only.
- Schema changes are applied to staging first and verified before production.
- MakLom production remains independently authorised via `public.app_members`.

## Initial configuration checkpoint

The initial Vercel Preview environment was configured on 2026-09-24. Authentication URL and email-template configuration is a separate hosted Supabase setting and must be verified whenever a new Supabase environment is introduced.
