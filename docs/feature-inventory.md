# Feature inventory

**Snapshot date:** 25 September 2026  
**Reference branch:** `staging`

This inventory records implemented capability in the current KELUARGA + MakLom architecture. It is not a backlog.

## 1. Product mission

KELUARGA is the volunteer-facing application for discovery, registration, event preparation, Event Operations and recognised volunteer development.

MakLom is the Volunteer Management application for prospective-volunteer lead review, managed longitudinal profiles, data quality, contribution-hour approval and cross-event staff intelligence.

Both applications share `core.volunteers.id` as the canonical person key.

YM Hub/Salesforce is dormant future downstream integration infrastructure.

## 2. Volunteer-facing KELUARGA

Implemented:

- branded landing and role/pathway pages;
- public opportunities and opportunity details;
- FormSG CTAs for prospective-volunteer intake;
- public news;
- FAQ route/shell;
- public Volunteer Pathways;
- passwordless volunteer sign-in;
- native canonical volunteer provisioning with immutable `KELxxxxx` IDs;
- direct KELUARGA opportunity registration;
- shift selection;
- pending / confirmed / waitlisted / rejected / cancelled / withdrawn registration lifecycle;
- withdrawal/resubmission rules before attendance starts;
- registration notifications;
- Event Guides with venue, directions, briefing and programme information;
- volunteer dashboard;
- guided first-time profile onboarding with resumable completion milestones;
- direct section-by-section profile editing after onboarding, including single-purpose photo changes;
- private volunteer operational profile data for date of birth, home address/postal code, dietary requirements, food allergies, T-shirt size, education, languages and emergency contact;
- profile-completeness milestones covering contact, home area, personal details, interests, skills, availability, event readiness, education and photo;
- approved contribution-hours display from MakLom-approved contribution records;
- audited self-service display-name/mobile editing;
- points balance/history;
- active badges;
- staff-confirmed pathway positions.

Retired from the live volunteer journey:

- in-app KELUARGA prospective-volunteer recruitment application;
- Volunteer.gov.sg runtime import/discovery;
- external registration-link architecture;
- live YM Hub dependency for identity, registration or approved hours.

## 3. KELUARGA staff administration

### Staff access

Implemented four-tier model:

- `admin` — all KELUARGA functions plus transactional MakLom admin entitlement;
- `volteam` — all KELUARGA operational/content functions except staff-access administration;
- `staff` — Event Operations for existing programmes without programme creation/deletion;
- `volunteer_leader` — reduced attendance operations.

Staff access changes are server-side, confirmed and audited.

### Programme/content management

Implemented:

- programme/event creation and editing;
- public opportunity presentation fields;
- publication controls;
- Event Guide publication controls;
- news creation/editing;
- programme rundowns;
- multi-day/multi-shift configuration;
- optional per-shift registration capacity;
- retained revision/history foundations.

### Volunteer data and inventory

Implemented:

- private volunteer-details domain keyed by the canonical volunteer UUID;
- VolTeam/Admin volunteer directory with search and filtering by available planning area, electoral division, T-shirt size and highest qualification;
- GE2025 electoral boundary reference dataset, PostGIS boundary storage and coordinate-to-GRC/SMC resolver;
- server-side OneMap postal-code verification that derives normalized address, coordinates and planning area before GE2025 electoral lookup;
- filtered volunteer CSV export;
- volunteer-shirt catalogue for round-neck and collared shirts in S, M, L, XL, 2XL, 3XL, 5XL and 7XL;
- append-only stock movements for opening stock, receipts, adjustments, returns and issues;
- transactional stock decrement on shirt issue;
- one-shirt-per-volunteer database constraint;
- legacy shirt-issue recording for volunteers who received a shirt before KELUARGA inventory tracking.

Planning-area and electoral-division fields are stored separately from volunteer input and are populated only through verified geographic enrichment. OneMap credentials must be configured in the deployment environment before live postal-code verification can run.

### Registration review

Implemented:

- staff review of KELUARGA registrations;
- confirm / waitlist / reject;
- idempotent confirmed-registration -> roster population;
- stable volunteer, registration and shift references;
- safe cancellation/withdrawal history.

## 4. Event Operations

Implemented:

- current/upcoming and past-event staff views;
- Quick Event Operations for manual/last-minute events;
- CSV roster upload;
- pasted roster data;
- roster template export;
- isolated vs integrated manual-event mode;
- canonical volunteer matching/creation for integrated manual rosters;
- walk-ins;
- dietary/T-shirt/contact fields;
- shift assignment;
- check-in and check-out;
- absent/withdrawn states;
- audited timestamp corrections;
- bulk checkout;
- continuous attendance across adjacent/overlapping shifts where configured;
- checkout/re-check-in for separated shifts with a gap;
- early checkout;
- live attendance monitor;
- attendance reconciliation;
- QR attendance/feedback foundation;
- attendance export;
- event report export;
- contextual volunteer insights;
- contextual volunteer reviews;
- event feedback;
- first-shirt status and issuance from Event Operations for linked volunteers;
- transactional shirt issue enforcement so each volunteer has at most one recorded volunteer shirt.

Operational attendance remains evidence until contribution review.

## 5. Shared KELUARGA + MakLom data platform

Implemented on the current staging architecture:

- one canonical `core.volunteers.id`;
- immutable `KELxxxxx` human identifier;
- MakLom `public.volunteers.core_volunteer_id` profile linkage;
- retained legacy aliases;
- FormSG/MakLom volunteer-lead model;
- deliberate lead conversion with duplicate/match safeguards;
- KELUARGA attendance -> `volunteer_contributions` candidate flow;
- MakLom-only approval boundary for contribution hours;
- profile-change review inbox;
- contextual insight/review inbox;
- shared database with separate authorization domains.

Authorization:

- KELUARGA: `core.user_roles`
- MakLom: `public.app_members`

Only the intentional KELUARGA `admin` entitlement bridge provisions MakLom `admin`. Lower KELUARGA roles do not receive MakLom access.

## 6. Recognition and pathways

Implemented:

- append-only points ledger;
- manual audited staff-recognition points;
- versioned point-rule foundation;
- staff-defined badge catalogue;
- audited badge awards/revocations;
- versioned pathway maps;
- draft/preview/publish workflow;
- immutable published pathway versions;
- staff-confirmed personal pathway positions with retained history.

Not active yet:

- automatic attendance-derived points;
- automatic badge/milestone earning;
- automatic pathway advancement;
- referral rewards.

Attendance-derived automation must use MakLom-approved contribution records when policy is approved.

## 7. Volunteer Management intelligence

Implemented in KELUARGA source workflows:

- event-level insights;
- event-level reviews;
- feedback;
- event reports;
- source/event provenance for reviewed downstream use.

Shared-platform foundation implemented:

- profile-change review inbox;
- longitudinal insight/review inbox;
- contribution-review data model.

Still to complete in MakLom:

- contribution review UI;
- profile-change review UI;
- insight/review longitudinal inbox;
- cross-event volunteer intelligence/reporting.

## 8. Integrations

### FormSG

Current active intake channel for prospective volunteers. MakLom owns the resulting lead lifecycle.

### MakLom

Current active Volunteer Management partner application on the same Supabase data platform.

### Volunteer.gov.sg

Retired runtime integration. Historical imported data may remain for provenance only.

### YM Hub / Salesforce

Dormant future enterprise integration. Projection/integration objects may remain, but no current volunteer-facing workflow should depend on them.

## 9. Platform and security

Implemented:

- Next.js/Vercel application;
- Supabase Auth/PostgreSQL;
- forward-only migrations;
- Row Level Security;
- server-side privileged operations;
- audit events;
- pgTAP database/RLS tests;
- Vitest;
- lint/typecheck/build/dependency audit CI;
- security headers and redirect controls;
- CSV injection protection;
- staging/production environment separation.

## 10. Current limitations

See [Known issues](known-issues.md) and [Development roadmap](development-roadmap.md) for remaining work. The largest active gaps are MakLom review UIs, production reconciliation/promotion, end-to-end UAT and policy-dependent recognition automation.
