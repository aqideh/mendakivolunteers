# Phase 2: Native opportunity and news CMS

## Purpose

Phase 2 adds app-owned volunteer content while preserving YM Hub as the system of record for volunteer identity, registration, official attendance, and verified hours.

The portal owns:

- Opportunity discovery listings.
- News and announcements.
- Content workflow state.
- Revision snapshots and publication audit events.

The portal does not own:

- Opportunity registration.
- Registration confirmation.
- Official attendance or hours.
- Volunteer master records.

Every opportunity registration action is an HTTPS link-out to YM Hub.

## Application routes

Public routes:

- `/opportunities`
- `/opportunities/[slug]`
- `/news`
- `/news/[slug]`

Staff routes:

- `/admin/content`
- `/admin/content/opportunities/new`
- `/admin/content/opportunities/[id]/edit`
- `/admin/content/news/new`
- `/admin/content/news/[id]/edit`

The session proxy requires authentication for all `/admin` routes. Page loaders and server actions separately verify the active account and application roles.

## Content workflow

Supported states:

```text
draft -> in_review -> scheduled -> published -> archived
```

Content editors may:

- Create records in `draft` or `in_review`.
- Edit records that are still in `draft` or `in_review`.
- Read revision history.

Publishers and administrators may additionally:

- Schedule content.
- Publish content.
- Archive content.
- Edit scheduled, published, or archived records.

The interface restricts available states, but PostgreSQL triggers and Row Level Security are the authoritative enforcement layer. A crafted browser request cannot bypass publisher-only transitions.

## Database model

The `content` schema contains:

- `content.opportunities`
- `content.news_posts`
- `content.revisions`

Opportunity records contain an optional `ymhub_activity_id` for future reconciliation and a required HTTPS `registration_url`. Neither field makes the application authoritative for registrations.

Content bodies are stored as plain text in this phase. This deliberately avoids introducing an unsanitized HTML or rich-text execution surface. A later rich-text editor must define an allowlist, server-side sanitization, media policy, and migration approach before it is enabled.

## Publication visibility

Anonymous and authenticated volunteers can only read content when:

- The record is published, or its scheduled publication time has arrived.
- Its effective publication time is not in the future.
- It has not expired.

Staff content roles can read the full workflow set.

All CMS timestamps are entered as Singapore local time and converted to timezone-aware UTC values before storage. User-facing dates are formatted in `Asia/Singapore`.

## Revisions and auditing

Database triggers create an append-only snapshot after every insert and update. Each revision records:

- Content type and record ID.
- Revision number.
- Operation.
- Workflow status.
- Full JSON snapshot.
- Acting user, where available.
- Creation timestamp.

Status changes also create audit events. Browser clients have no insert, update, or delete privilege on revision records.

Deleting CMS records is intentionally excluded from this phase. Archiving preserves references, revision history, and accountability.

## Security controls

- Forced Row Level Security on all content tables.
- Least-privilege table grants.
- Active-account checks for CMS users.
- Separate editor and publisher roles.
- Database-enforced protection for already-live content.
- HTTPS-only registration URLs.
- UUID validation before edit queries or writes.
- Server-side validation for length, date ordering, status requirements, and URLs.
- No Salesforce or Supabase service credentials in browser code.
- No direct browser writes to audit or revision tables.

## Local role assignment

Use `supabase/snippets/grant_content_role.sql` in the local SQL editor after creating a test account. Role grants are administrative operations and are not exposed through the web application.

## Validation

The release checks include:

- ESLint.
- TypeScript checking.
- Vitest validation and identifier tests.
- Next.js production build.
- Dependency vulnerability audit.
- Supabase migration reset and prototype seed.
- pgTAP tests for RLS, grants, revision triggers, and publisher-only edits.

## Deferred work

The following remain outside this delivery slice:

- Media-library uploads.
- Rich-text authoring.
- Revision rollback UI.
- Audience segmentation.
- Content analytics beyond standard application telemetry.
- Salesforce opportunity synchronisation.

These should be introduced only with explicit ownership, security, retention, and operational requirements.
