# Development roadmap

**Last reviewed:** 24 September 2026  
**Reference branch:** `staging`

## Current mission

KELUARGA provides the volunteer-facing journey and Event Operations. FormSG provides prospective-volunteer intake. MakLom provides Volunteer Management review, longitudinal profiles, approved contributions and cross-event intelligence. Both applications share one canonical volunteer identity in Supabase.

YM Hub/Salesforce is dormant future downstream integration and is not part of the current delivery path.

## Active development to-do

Work through these in order unless a production defect takes priority.

- [ ] **Reconcile KELUARGA staging for production.** Build a clean production change set rather than merging the diverged branch wholesale. Include the approved role model, MakLom admin bridge, retired KELUARGA recruitment workflow, FormSG CTAs, landing/login changes and shared architecture.
- [ ] **Run shared-database production migration rehearsal.** Verify canonical identity, MakLom profile links, current production leads, aliases, contribution candidates and review inboxes against production-shaped data.
- [ ] **Finish MakLom React + Mantine changeover.** Rebuild Events, Attendance and Imports with feature parity, then switch production and retire the superseded static/Web Awesome runtime.
- [ ] **Build MakLom Contribution Review UI.** Pending/needs-review queue, approve, adjust minutes, reject, audit history and reviewer metadata.
- [ ] **Build MakLom Profile Change Review UI.** Review KELUARGA-submitted contact/profile proposals with approve/reject/apply actions.
- [ ] **Build MakLom Insights & Reviews Inbox.** Preserve event/source context, support accept/edit/dismiss and provide longitudinal volunteer history.
- [ ] **Activate FormSG -> MakLom production webhook.** Configure secret/endpoint, run a controlled submission, verify field mapping and verify retry/idempotency.
- [ ] **Run full Event Operations UAT.** Single shifts, adjacent/overlapping shifts, gaps, early/missing checkout, walk-ins, manual rosters, cancellations, corrections, QR and mobile event-day use.
- [ ] **Run end-to-end shared-platform UAT.** FormSG lead -> MakLom conversion -> KELUARGA registration -> roster -> attendance -> contribution review -> approved hours on dashboard.
- [ ] **Clean stale repository state.** Close/reconcile obsolete PRs/issues and remove stale runtime/document references to superseded YM Hub, Volunteer.gov.sg and KELUARGA recruitment architecture.
- [ ] **Define recognition policy.** Approved contribution eligibility, points values, effective dates, reversals/appeals, badge milestones and referral-success criteria.
- [ ] **Build cross-event Volunteer Management intelligence.** Volunteer history, accepted insights/reviews, repeat engagement, contribution trends, retention and impact reporting with explicit denominator/deduplication rules.

## Current platform priorities

### P0 — production consolidation

- production migration rehearsal;
- reviewed promotion of shared identity/contribution/inbox architecture;
- role and MakLom entitlement verification;
- FormSG production activation;
- realistic Event Operations UAT.

### P1 — MakLom operational completeness

- React/Mantine feature parity;
- contribution review;
- profile-change review;
- contextual insight/review inbox;
- duplicate/data-quality workflow refinement.

### P2 — volunteer experience and recognition

- activate attendance-derived points only from MakLom-approved contributions;
- define automatic badge/milestone criteria before implementation;
- preserve manual staff recognition as a separate provenance source;
- keep pathway advancement staff-confirmed until explicit automation rules exist;
- implement referrals only after an authoritative success condition is defined.

### P3 — management intelligence

- cross-event volunteer history;
- approved contribution reporting;
- retention/repeat engagement;
- participation and hours metrics with explicit counting rules;
- reviewed skill/interest development evidence.

### P4 — legacy retirement

Retire only after retention/migration decisions:

- `keluarga_recruitment_applications`;
- `keluarga_contribution_credits`;
- Volunteer.gov.sg import/override data;
- superseded opportunity CMS objects;
- legacy MakLom event/attendance structures where replaced;
- dormant `ymhub` and `integration.ymhub_*` objects.

### P5 — future enterprise integration

If YM Hub/Salesforce is reactivated:

- keep credentials server-only;
- attach external IDs to canonical identities;
- use idempotent/auditable synchronization;
- handle merges, corrections and deletions explicitly;
- preserve the current KELUARGA + MakLom ownership model;
- do not redesign volunteer-facing flows around Salesforce IDs.

## Delivery rules

- `main` remains production.
- `staging` is the current verification environment.
- Database changes use forward-only migrations.
- Shared-schema changes require database/RLS regression coverage.
- Material feature changes update the feature inventory, roadmap and architecture docs together.
- Security/identity failures take priority over cosmetic work.
- Historical documents do not override canonical current-state architecture.
