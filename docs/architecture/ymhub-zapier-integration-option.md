# YM Hub integration option: Zapier intermediary

Date recorded: 2026-08-14
Status: under evaluation; not an approved production architecture

## Context

DTI has raised security concerns about allowing the MENDAKI Volunteers application to hold a direct API connection to YM Hub, which is Salesforce-backed. An alternative under discussion is to use Zapier as an intermediary while the application continues to evolve.

This note records the preferred shape of that option so that a future proof of concept or security review does not accidentally weaken the existing Phase 3 architecture.

YM Hub remains the system of record for volunteer identity, registration, authoritative attendance, and verified hours. Supabase remains the application-side projection and data store used by the volunteer portal.

## Proposed boundary

The preferred flow is:

```text
YM Hub / Salesforce
        |
        | DTI-approved integration identity
        v
      Zapier
        |
        | HTTPS + restricted machine credential
        v
MENDAKI Volunteers integration endpoint
        |
        | validation, canonical mapping checks,
        | idempotency, reconciliation and audit
        v
     Supabase
        |
        v
 Volunteer UI
```

Zapier should be treated as a transport and orchestration layer, not as the application's database or primary business-logic layer.

The application should expose a narrow server-only integration endpoint such as:

```text
POST /api/integrations/ymhub/v1/events
```

Zapier would send canonical payloads to that endpoint. Salesforce object names and field API names should not leak into the rest of the application.

Example canonical payload:

```json
{
  "schemaVersion": 1,
  "eventType": "registration.updated",
  "externalRegistrationId": "...",
  "externalVolunteerId": "...",
  "externalActivityId": "...",
  "status": "confirmed",
  "sourceUpdatedAt": "2026-08-14T06:45:21Z"
}
```

The exact source object and field mappings remain subject to the reviewed YM Hub field contract.

## Security principles

The intermediary model is attractive because the evolving web application would not need to hold Salesforce credentials. A DTI-approved integration identity could instead be restricted to the minimum Salesforce objects and fields required by the portal.

The following controls should remain mandatory:

- no Salesforce credential is exposed to the browser;
- Zapier receives only the minimum YM Hub permissions and data needed for the approved workflow;
- the MENDAKI Volunteers endpoint accepts only authenticated machine-to-machine requests;
- payloads are schema-validated before any database change;
- unknown or unmapped source statuses fail ingestion rather than being coerced into a catch-all state;
- duplicate or retried deliveries are safe through deterministic idempotency;
- source timestamps are used to prevent older events from overwriting newer authoritative state;
- integration success, failure and freshness remain observable;
- outages fail closed and never cause mock, fabricated or silently substituted operational data to appear.

The Supabase `service_role` credential should not be placed in Zapier. Zapier should call the application integration endpoint, and the application server should retain responsibility for privileged Supabase writes.

## Initial scope

Start with a one-way, read-only YM Hub-to-portal integration.

Suitable early domains are:

- volunteer identifier and status;
- registration or participation records;
- attendance records;
- verified hours when the source contract is approved;
- shared activity metadata required to display authoritative history.

Do not make application-to-YM Hub writes part of the initial approval. Attendance capture or other future write-back workflows should undergo a separate security and operating-process review.

This preserves the existing rule that an application-side attendance capture is not authoritative attendance until YM Hub records or verifies it.

## Responsibilities by layer

### Zapier

Keep Zapier limited to:

- maintaining the approved Salesforce connection;
- detecting or receiving relevant source changes;
- filtering to approved records;
- simple field transformation into the agreed canonical contract;
- delivering the event to the MENDAKI Volunteers integration endpoint;
- retrying delivery according to the approved operating model.

### MENDAKI Volunteers backend

Keep application integration logic responsible for:

- authenticating the integration caller;
- JSON/schema validation;
- canonical status validation;
- idempotency and duplicate suppression;
- ordering and stale-event protection;
- reconciliation rules;
- audit events;
- sync-state and freshness tracking;
- privileged Supabase writes;
- explicit error and unavailable states.

Avoid implementing substantial domain logic inside long multi-step Zaps. That would turn workflow configuration into an undocumented backend and make later migration difficult.

## Data protection and vendor review

Before production approval, DTI and the relevant data-protection owner should review the exact data that would pass through Zapier and the current vendor terms at the time of implementation.

The review should cover at least:

- data residency and cross-border processing;
- retention of workflow payloads and logs;
- subprocessors;
- access controls and administrative roles;
- incident response and breach notification;
- auditability;
- deletion and offboarding;
- supported authentication model for Salesforce;
- network controls such as outbound IP restrictions if required;
- contractual and PDPA transfer obligations.

Minimise the payload wherever possible. Stable external identifiers and status fields are preferable to sending names, email addresses, phone numbers, dates of birth, addresses or other personal data unless those fields are genuinely required by the approved use case.

Vendor capabilities and contractual terms can change, so this section must be revalidated during implementation rather than treated as permanent factual documentation.

## Recommended proof of concept

The first proof of concept should be intentionally small:

```text
YM Hub volunteer status change
        |
        v
      Zapier
        |
        v
/api/integrations/ymhub/v1/volunteers
        |
        v
     Supabase
        |
        v
 Volunteer dashboard
```

Limit the payload to approximately:

```json
{
  "externalVolunteerId": "...",
  "status": "active",
  "sourceUpdatedAt": "..."
}
```

The PoC should demonstrate that:

1. the Salesforce integration identity can see only approved objects and fields;
2. no Salesforce credentials enter Vercel, Supabase or the browser;
3. no Supabase privileged credential enters Zapier;
4. duplicate deliveries are harmless;
5. invalid or unknown statuses are rejected visibly;
6. stale source events cannot overwrite newer data;
7. Zap or endpoint failures are observable;
8. the portal distinguishes unavailable, stale and authoritative empty states;
9. revoking the Salesforce integration identity terminates access;
10. DTI can identify exactly what data crosses the intermediary.

After the volunteer-status flow is accepted, registration and attendance projections can extend the same contract and reconciliation model.

## Feasibility assessment

This option is technically feasible for the current roadmap and is especially well suited to asynchronous, read-only synchronisation where YM Hub remains authoritative.

It is less suitable as the primary mechanism for latency-sensitive request/response operations or complex transactional writes spanning several Salesforce records. Those requirements, if introduced later, should trigger a fresh integration review rather than being forced through the original Zapier design.

## Decision still required

No production decision is recorded here.

DTI, the product owner and the relevant data-protection/security reviewers still need to decide whether the intermediary model is acceptable after reviewing the non-production PoC, field-level permissions, failure behaviour, data flows and current Zapier vendor terms.

If accepted, the implementation should preserve the existing Phase 3 canonical read-model boundary so that Zapier can later be replaced without requiring the volunteer-facing application to be redesigned.
