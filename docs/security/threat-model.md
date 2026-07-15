# Phase 1 threat model

## Protected assets

- Volunteer identity links.
- Downstream YM Hub volunteer data.
- Staff roles and administrative permissions.
- Authentication sessions.
- Future attendance exports, points, referrals, and CMS content.
- Salesforce and Supabase server credentials.
- Security and administrative audit records.

## Trust boundaries

1. Volunteer browser to Next.js and Supabase Data API.
2. Next.js server runtime to Supabase.
3. Future integration runtime to YM Hub.
4. Staff administration interface to privileged server operations.
5. Local database fixtures to staging and production deployment boundaries.

## Principal threats and controls

| Threat | Initial controls |
|---|---|
| A volunteer reads another volunteer's record | Forced RLS, self-only policies, UUID internal keys, unit and pgTAP checks |
| A user claims another person's YM Hub ID | No browser write policy for identity links; no direct claim endpoint; support-case model |
| An attacker grants a staff role | No browser write grants or RLS policy on roles; role-change audit trigger |
| A leaked publishable key bypasses access control | Publishable keys are treated as public; authorization remains in RLS |
| A leaked service or Salesforce secret exposes data | Secrets remain server-side, environment separated, and excluded from source control |
| Local fixture data reaches production | Explicit `APP_ENV`, no runtime fixture adapter, and a closed production deployment gate |
| An incomplete Salesforce integration is enabled | Production deployment remains blocked until the real adapter and mappings are reviewed |
| Open redirect through authentication callback | Internal-path allowlist and redirect unit tests |
| Account enumeration through sign-in | Generic response for eligible and ineligible email addresses |
| Session cookie spoofing | Server and proxy authorization uses `auth.getClaims()` rather than trusting a local session object |
| Cross-site framing or unsafe browser capabilities | CSP, frame denial, permissions policy, content-type and referrer headers |
| Dependency compromise or known high-severity issue | Exact top-level versions, Dependabot, CI audit, pinned framework and integration packages |
| Administrative changes are disputed | Restricted append-only audit stream with targeted events |

## Security work required before production

- Implement and review the Salesforce OAuth client-credentials flow.
- Restrict the Salesforce integration identity to the minimum objects and fields.
- Add MFA enforcement for all staff roles.
- Add central application error monitoring without logging personal data or tokens.
- Add rate limits for authentication, attendance, reward checks, and referrals.
- Complete an independent penetration test.
- Test database and media restoration.
- Define retention and deletion schedules with MENDAKI's DPO.
- Review Content Security Policy against the selected deployment platform and analytics tools.
- Run cross-account RLS tests using real JWTs in staging.
- Review and approve every lockfile change through dependency CI.

## Logging rules

Never log:

- Access or refresh tokens.
- Magic-link token hashes.
- Salesforce client secrets.
- Supabase secret or legacy service-role keys.
- Complete volunteer records.
- Raw referral or attendance evidence unless explicitly required and access controlled.

Use request IDs and internal UUIDs for diagnostics. External volunteer IDs should appear in restricted operational logs only when needed for reconciliation.
