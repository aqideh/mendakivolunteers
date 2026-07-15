# Development roadmap

This roadmap preserves YM Hub as the system of record for volunteer identity,
registration, verified attendance, and verified hours. Each phase must fail
closed when an authoritative dependency is unavailable: the application must
show an explicit unavailable state or error and must never substitute mock,
cached, or fabricated operational data.

## Phase 0: repository baseline and release controls

Status: complete when the `main` validation workflow passes.

- Remove obsolete branches, duplicate deployment paths, dead runtime adapters,
  and duplicate documentation.
- Pin the supported Node.js major and commit a reproducible npm lockfile.
- Require explicit environment, sign-up, and registration-host configuration.
- Enforce approved HTTPS registration hosts and physical-opportunity locations.
- Add request-specific Content Security Policy headers and production HSTS.
- Keep production deployment blocked until the real YM Hub adapter is verified.

Exit criteria: lint, unit tests, type checks, production build, dependency audit,
database reset, and pgTAP tests pass from a clean checkout of `main`.

## Phase 1: platform and identity foundation

Status: implemented; production integration remains gated by Phase 3.

- Supabase authentication and protected volunteer routes.
- Separate application account, internal volunteer, and YM Hub identifiers.
- Database roles, forced Row Level Security, account-link cases, and audit events.

Exit criteria: identity and authorization invariants remain covered by database
tests, with no browser capability to assign roles or alter YM Hub projections.

## Phase 2: opportunity and news CMS

Status: implemented.

- Public opportunity and news publishing.
- Staff editor and publisher workflows with revision history.
- YM Hub registration link-outs without app-owned registration state.

Exit criteria: publication transitions, registration URLs, revisions, grants,
and Row Level Security remain enforced by PostgreSQL and covered by tests.

## Phase 3: read-only YM Hub integration

Status: next delivery phase; discovery work exists separately and requires
review before it is integrated.

- Obtain reviewed Salesforce object and field API names, permission scopes,
  record volumes, and change semantics.
- Implement one server-only, read-only adapter with typed canonical mappings.
- Reconcile volunteer identity and status into the existing projection tables.
- Add idempotency, freshness indicators, observability, health checks, and
  explicit unavailable states.
- Remove the production deployment block only after integration, security,
  failure-mode, and reconciliation tests pass against a non-production tenant.

Exit criteria: no Salesforce credential reaches the browser; outages cannot
produce substitute records; stale records are visibly marked; mapping changes
are versioned and audited.

## Phase 4: attendance capture and staff handoff

Status: planned; depends on Phase 3 and an approved operating process.

- Capture check-in intent or evidence without claiming verified attendance.
- Provide staff exception handling, deduplication, and handoff tracking.
- Reconcile capture records to authoritative YM Hub attendance records.
- Define offline, privacy, retention, accessibility, and device-support rules
  before selecting QR, kiosk, or staff-assisted interaction patterns.

Exit criteria: the interface distinguishes captured, submitted, rejected, and
verified states; only a downstream verified YM Hub record counts as attendance.

## Phase 5: volunteer history and engagement

Status: planned; depends on verified Phase 4 data.

- Show authoritative participation history and verified hours.
- Add points, badges, referrals, or recognition only after policy, appeals,
  expiry, anti-abuse, and privacy requirements are approved.
- Keep derived rewards traceable to immutable verified source records.

Exit criteria: calculations are deterministic, auditable, reversible through
documented correction workflows, and never awarded from capture-only records.

## Phase 6: controlled production rollout

Status: planned across all production-facing phases.

- Complete security review, data-protection review, accessibility testing,
  recovery exercises, operational runbooks, and support training.
- Roll out to staff and volunteer cohorts with measurable service objectives.
- Monitor authentication, integration freshness, reconciliation exceptions,
  content operations, and user outcomes without collecting unnecessary data.

Exit criteria: named service owners accept the runbooks and residual risks,
recovery objectives are tested, and production release checks pass on `main`.

## Delivery rules

- `main` is the integration and release branch; every direct change must leave
  it deployable or deliberately blocked by an explicit release gate.
- Database changes use forward-only Supabase migrations and accompanying pgTAP
  coverage.
- External integrations are server-only, least-privilege, observable, and
  fail closed.
- A phase is complete only when its exit criteria are automated where possible
  and the remaining manual evidence is recorded.
