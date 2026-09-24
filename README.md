# KELUARGA MENDAKI

KELUARGA is MENDAKI's volunteer-facing web application for discovering ways to contribute, registering for opportunities, preparing for deployments, participating in event operations, and tracking recognised volunteer development.

KELUARGA is one part of a shared Volunteer Management platform:

- **KELUARGA** owns the volunteer-facing experience, opportunity registration, rosters, Event Guides, event-day attendance, feedback, pathways and recognition surfaces.
- **FormSG** is the public intake channel for prospective volunteers.
- **MakLom** is the higher-sensitivity Volunteer Management application for FormSG lead review, staff-managed longitudinal volunteer profiles, duplicate/data-quality work, contribution-hour approval, reviewed profile changes/insights, and cross-event reporting.
- **Supabase** is the shared data platform. KELUARGA and MakLom share one canonical volunteer identity but retain separate authorization domains.
- **YM Hub/Salesforce** is dormant future downstream integration infrastructure. It is not a current KELUARGA runtime dependency.

## Mission

KELUARGA should make volunteering with MENDAKI easier from discovery to deployment while giving staff reliable event operations and preserving strong data-governance boundaries.

The product is designed around five principles:

1. volunteers can discover and register without waiting for an external backend record;
2. event operations work directly from KELUARGA registrations and canonical volunteer identity;
3. operational attendance is evidence, not automatically approved longitudinal volunteer hours;
4. MakLom reviews and owns higher-sensitivity longitudinal Volunteer Management data;
5. external organisational integrations remain downstream and must not dictate the volunteer-facing workflow.

## Current architecture

```text
Prospective volunteer
    -> KELUARGA discovery / role pages
    -> FormSG
    -> MakLom volunteer lead
    -> staff review / deliberate conversion
    -> core.volunteers canonical identity

Canonical volunteer
    -> KELUARGA opportunity registration
    -> registration decision / waitlist
    -> Event Operations roster
    -> check-in / check-out
    -> volunteer_contributions candidate
    -> MakLom review / adjustment
    -> approved contribution hours
    -> KELUARGA volunteer dashboard
```

The canonical person key is `core.volunteers.id`. The immutable human-facing volunteer code is `KELxxxxx`.

MakLom extends the same person through `public.volunteers.core_volunteer_id`. Email and mobile can support matching but are not permanent cross-system identity keys.

### Authorization boundary

The database and Auth tenant are shared; permissions are not.

- KELUARGA authorization: `core.user_roles`
- MakLom authorization: `public.app_members`

KELUARGA staff tiers are:

- **admin** — full KELUARGA access; MakLom still requires separate entitlement
- **VolTeam** — full KELUARGA management/operations except MakLom
- **staff** — event operations on existing programmes; no programme creation/deletion
- **volunteer leader** — reduced event operations focused on basic check-in/out

KELUARGA authorization and MakLom authorization are enforced separately. The one intentional entitlement bridge is `admin`: promoting a staff member to KELUARGA Admin also provisions MakLom administrator membership transactionally; demoting them removes that MakLom membership. Lower KELUARGA roles do not gain MakLom access.

## Current capabilities

### Volunteer-facing

- Public landing pages, role/pathway discovery, opportunities, news and FAQ shell.
- Passwordless volunteer sign-in and immutable `KELxxxxx` identity.
- Direct KELUARGA opportunity registration with shift selection.
- Pending, confirmed, waitlisted, rejected, cancelled and withdrawn registration states.
- Event Guides and event preparation information.
- Volunteer dashboard with registration state, approved contribution hours, pathways, badges and points history.
- Self-service app-owned display-name/mobile editing with audit/review boundaries.
- Public volunteer Pathways skill tree.

### Staff-facing

- Programme/event creation and publishing.
- Registration review and capacity/waitlist handling.
- Multi-day and multi-shift Event Operations.
- CSV/paste roster import, walk-ins and manual-event modes.
- Integrated or intentionally isolated manual rosters.
- Check-in/out, continuous adjacent-shift attendance, early checkout, corrections and reconciliation.
- QR attendance/feedback foundation.
- Event reviews, insights, feedback and event reporting.
- Points, badge and pathway administration.
- Staff access management using the four KELUARGA access tiers.

### Shared Volunteer Management platform

- One canonical volunteer UUID across KELUARGA and MakLom.
- FormSG -> MakLom volunteer-lead pipeline.
- Deliberate lead conversion with duplicate/match safeguards.
- KELUARGA attendance -> contribution candidate -> MakLom approval boundary.
- Reviewed profile-change and longitudinal insight inboxes.
- Legacy identifiers retained as aliases rather than parallel identities.

## Data ownership

| Domain | Owner |
|---|---|
| Canonical person identity / KEL code | Shared `core.volunteers` |
| Volunteer-facing account/session | KELUARGA |
| Opportunity, registration, roster, Event Guide | KELUARGA |
| Event-day operational attendance | KELUARGA |
| Prospective-volunteer form | FormSG |
| Lead review and conversion | MakLom |
| Staff-managed longitudinal volunteer profile | MakLom |
| Approved contribution hours | MakLom review of KELUARGA evidence |
| Duplicate/data-quality management | MakLom |
| Pathways, points and badges presentation | KELUARGA |
| Future YM Hub/Salesforce handoff | Separate downstream integration |

## Legacy and dormant components

Some historical tables, modules and names remain because they are deployed contracts or retained provenance. They are not parallel current sources of truth.

Examples include:

- `keluarga_recruitment_applications`
- `keluarga_contribution_credits`
- legacy MakLom event/attendance tables
- Volunteer.gov.sg import/override history
- superseded opportunity CMS objects
- `ymhub` and `integration.ymhub_*` schemas
- historical `phaseone` naming

Retire these only through deliberate forward migrations after retention and migration requirements are settled.

## Production ownership

- GitHub repository: `aqideh/mendakivolunteers`
- Production branch: `main`
- Verification branch/environment: `staging`
- Hosting: Vercel
- Shared backend: Supabase, Singapore region
- Runtime: Node.js 24

`main` remains production. Shared-schema changes must be rehearsed and verified before promotion.

## Documentation

Start with [docs/README.md](docs/README.md).

Canonical current-state documents:

- [KELUARGA + MakLom domain architecture](docs/architecture/keluarga-maklom-domain-architecture.md)
- [Current system architecture](docs/architecture/current-system.md)
- [Recruitment, registration and Event Operations model](docs/architecture/recruitment-registration-event-operations.md)
- [Feature inventory](docs/feature-inventory.md)
- [Development roadmap](docs/development-roadmap.md)
- [Known issues](docs/known-issues.md)
- [Production handover](docs/operations/production-handover.md)
- [Threat model](docs/security/threat-model.md)

Documents labelled historical/dormant are retained for implementation history only and must not override the current-state documents above.

## Validation

```bash
npm run lint
npm run typecheck
npm run test
npm run build
npm run security:audit
npm run db:test
```

Database changes use forward-only migrations and require regression coverage where applicable. Never commit environment files, service-role keys, FormSG secrets or other credentials.
