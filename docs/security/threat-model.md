# KELUARGA + MakLom threat model

**Last reviewed:** 24 September 2026

## Protected assets

- Canonical volunteer identity and aliases.
- Volunteer account/contact data.
- MakLom longitudinal profile and sensitive Volunteer Management data.
- Prospective-volunteer lead data.
- Registrations, rosters and attendance evidence.
- Approved contribution-hour decisions.
- Staff roles and MakLom entitlements.
- Points/badge/pathway history.
- FormSG webhook secret and signature validation.
- Supabase/Vercel server credentials.
- Audit records.

## Trust boundaries

1. Volunteer browser -> KELUARGA Next.js/Supabase.
2. KELUARGA server runtime -> shared Supabase.
3. Staff browser -> KELUARGA privileged server actions.
4. MakLom browser/application -> shared Supabase under separate authorization.
5. FormSG -> signed Supabase Edge Function -> MakLom lead table.
6. Future enterprise integration -> shared platform (dormant, not current runtime).

## Principal threats and controls

| Threat | Control |
|---|---|
| Volunteer reads another volunteer's data | forced RLS, account-scoped functions, canonical UUID scoping |
| User self-claims another identity | no browser canonical-link write path; ambiguous matches require staff review |
| FormSG webhook spoofing | official signature verification, exact endpoint binding, expected form ID |
| Duplicate webhook retries create duplicate leads | unique source/form/submission identity and idempotent ingestion |
| Lead automatically becomes a volunteer | explicit staff conversion boundary |
| Lower KELUARGA roles accidentally gain MakLom access | separate authorization stores; only the intentional KELUARGA `admin` -> MakLom `admin` entitlement bridge is synchronized transactionally |
| Staff escalates privileges | privileged server-side role management, confirmation step, audit |
| Raw attendance becomes approved hours | KELUARGA cannot approve attendance-derived contributions; MakLom review required |
| Event observation becomes permanent profile judgement | reviewed inbox with source/event provenance |
| Shared database leaks cross-domain data | least-privilege grants, RLS, server-only privileged operations |
| Publishable key is treated as secret | authorization lives in RLS/server checks, not key secrecy |
| Service credentials leak | server-only managed secrets; never in browser/source/docs |
| Unsafe CSV/formula content | CSV neutralisation/validation |
| Session or redirect abuse | verified auth claims, controlled redirects, security headers |
| Dependency vulnerability | pinned/managed dependencies, CI audit and review |
| Legacy table is mistaken for live source | current architecture docs and explicit source-of-truth boundaries |

## Required launch/security work

- Complete realistic cross-account RLS tests in staging.
- Test role boundaries for all four KELUARGA tiers and MakLom entitlement separation.
- Validate FormSG webhook signing and secret handling in production.
- Add/maintain centralized error monitoring without logging secrets or unnecessary personal data.
- Apply reasonable rate limits to authentication and abuse-prone actions.
- Test backup/restore procedures.
- Define retention/deletion schedules with appropriate governance owners.
- Review CSP and external link/content policies.
- Continue dependency and source-security review.
- Conduct independent security testing before broad external rollout where required.

A Salesforce OAuth client is **not** a current production prerequisite. If enterprise integration is later approved, it receives its own scoped threat review.

## Logging rules

Never log:

- access/refresh tokens;
- magic-link token hashes;
- Supabase secret/service keys;
- FormSG secrets or decrypted full submissions;
- future Salesforce credentials;
- complete volunteer profiles when an internal ID is sufficient.

Use request IDs and canonical internal UUIDs for diagnostics. Retain external IDs only when operationally necessary and access controlled.
