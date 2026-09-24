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

`NEXT_PUBLIC_APP_URL` may be omitted for Vercel Preview deployments because the application infers the deployment URL from Vercel.

Keep **Production** environment variables pointed at production.

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

The initial Vercel Preview environment was configured on 2026-09-24. This commit exists to trigger and verify the first staging deployment against the isolated staging Supabase project.
