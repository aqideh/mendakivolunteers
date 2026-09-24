# Staff access model

**Status:** Architecture invariant  
**Scope:** KELUARGA, MakLom and the shared Supabase data platform

## Principle

A shared database does not imply shared application access.

KELUARGA authorization and MakLom authorization are deliberately independent. A staff member can use one application, both applications or neither, even when the same Supabase Auth identity is used.

## KELUARGA capabilities

| Role | Intended capability |
|---|---|
| `support_officer` | Volunteer recruitment and support workflows |
| `content_editor` | Draft/edit content |
| `publisher` | Publish content |
| `pathway_manager` | Manage pathway content and positions |
| `attendance_manager` | Event Operations: rosters, check-in/out, attendance and operational event-day workflows |
| `programme_manager` | Create, duplicate and structurally edit programmes/events, opportunity details, schedules and Event Guides |
| `gamification_manager` | Points and badges workflows |
| `auditor` | Audit/read-oriented access where implemented |
| `admin` | Full KELUARGA administration, including staff access |

Roles are additive. A staff member may hold more than one capability.

### Event Operations boundary

`attendance_manager` does **not** imply permission to:

- create canonical programmes;
- change programme/opportunity details;
- edit schedules or Event Guide configuration;
- alter programme rundown content;
- manage staff access;
- administer MakLom.

`programme_manager` includes access to Event Operations so that programme owners can operate the programmes they manage.

## MakLom boundary

MakLom uses its own `public.app_members` allow-list with:

- `viewer`
- `editor`
- `admin`

KELUARGA roles do not grant MakLom access. In particular:

- KELUARGA `admin` is not automatically a MakLom member.
- MakLom `admin` is not automatically a KELUARGA administrator.
- Access to MakLom should be narrower because it exposes the canonical volunteer data-management, reconciliation, duplicate-resolution and reporting layer.

## Authentication

The same Supabase Auth account may be used across both applications after backend consolidation. Authorization remains application-specific:

```text
Supabase Auth identity
        |
        +--> core.user_roles --------> KELUARGA capabilities
        |
        +--> public.app_members -----> MakLom access
```

Authorization decisions must be enforced server-side and at the database/RLS layer where sensitive data is directly exposed.

## Operational rule

Grant the least capability required for the staff member's duties. Avoid using `admin` as the default staff role.
