# Phase 2: Opportunity and news CMS

## Purpose

Phase 2 adds the first volunteer-facing engagement modules while preserving the system-of-record boundary established in Phase 1.

The portal owns:

- Opportunity discovery listings.
- News and announcements.
- Publishing workflow and revision history.
- Staff authorization for content operations.

YM Hub remains authoritative for:

- Opportunity registration.
- Registration status.
- Participation and completion.
- Official attendance verification.
- Verified volunteer hours.

An opportunity's `registration_url` is therefore an external YM Hub link-out. Clicking it does not create a registration in the portal.

## Data model

The exposed `content` schema contains:

- `content.opportunities`
- `content.news_posts`
- `content.revisions`

The `content.revisions` table is append-only and receives a full JSON snapshot after each insert or update. Browser roles cannot insert, update, or delete revision rows directly.

Content states are:

```text
draft -> in_review -> scheduled -> published -> archived
```

Publishers may also return content to draft or review when correction is required. The database guards any insert or update involving `scheduled`, `published`, or `archived` records so that content editors cannot modify live content through a direct Data API request.

## Authorization

| Role | Draft | Review | Schedule | Publish | Archive |
|---|---:|---:|---:|---:|---:|
| Content editor | Yes | Yes | No | No | No |
| Publisher | Yes | Yes | Yes | Yes | Yes |
| Administrator | Yes | Yes | Yes | Yes | Yes |

Authorization is enforced twice:

1. Server-side route and action checks provide clear user handling.
2. PostgreSQL grants, Row Level Security, and trigger guards enforce the boundary independently of the interface.

The private `app_private` schema is not exposed through the Supabase Data API. Security-definer helpers use fixed search paths, check the authenticated user, and have direct execution revoked from browser roles.

## Public access

Anonymous and authenticated users may select only records that are:

- Published, or scheduled with a publication time that has arrived.
- Not expired.
- Within the public visibility window.

Draft, review, future scheduled, archived, and expired records remain hidden by RLS.

## Time handling

CMS date-time controls are interpreted as `Asia/Singapore`. Server-side validation converts the local value to an ISO timestamp before storage in PostgreSQL. Public pages format stored values back into Singapore time.

## Content safety

Content bodies are stored and rendered as plain text paragraphs. Raw staff-authored HTML is not accepted, which avoids introducing a rich-text script injection surface in this delivery slice.

Registration URLs must:

- Be valid URLs.
- Use HTTPS.
- Remain outside the portal's registration state.

## Testing

Phase 2 adds:

- Unit tests for date conversion and content validation.
- Migration tests for schema, grants, and RLS.
- Revision and audit-trigger tests.
- Publisher-only status-transition tests.
- A direct-update test confirming that editors cannot modify already-published content.

## Deferred scope

The following are intentionally deferred:

- Media library and image uploads.
- Rich-text editor.
- Revision rollback interface.
- Scheduled background publication jobs; visibility currently derives from status and timestamps at query time.
- Salesforce/YM Hub API integration.
- Attendance capture and handoff.
- Verified-attendance reward processing.
