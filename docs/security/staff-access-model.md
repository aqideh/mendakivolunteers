# Staff access model

**Status:** Architecture invariant  
**Scope:** KELUARGA, MakLom and the shared Supabase data platform

## Principle

KELUARGA uses one mutually exclusive staff access level per staff account. Normal volunteer accounts retain the separate `volunteer` role.

The four staff levels are hierarchical:

| Access level | KELUARGA access | MakLom |
|---|---|---|
| `volunteer_leader` | Basic event-day attendance operations only | No access |
| `staff` | Full Event Operations for existing programmes | No access |
| `volteam` | All KELUARGA operational and content functions except staff access administration | No access |
| `admin` | All KELUARGA functions, including staff access administration | MakLom administrator |

Changing a staff access level replaces the previous staff level. Staff levels are not additive.

## Volunteer Leader

Volunteer Leaders are intended for trusted on-site volunteer leads who need only the minimum tools required to operate attendance.

Allowed:

- view event and shift rosters;
- search and filter volunteers;
- check an individual volunteer in or out;
- mark absent or withdrawn and clear those statuses;
- continue an on-site attendance session into an adjacent shift;
- display or generate event check-in/check-out QR codes.

Not allowed:

- add or edit walk-ins;
- upload or replace rosters;
- make manual timestamp corrections;
- bulk checkout;
- review registrations;
- access reconciliation or attendance audit history;
- export attendance or event reports;
- create volunteer ratings/reviews;
- capture or review volunteer insights;
- edit programme, opportunity, schedule or Event Guide details;
- create, duplicate or delete events;
- manage recruitment, pathways, points, badges or staff access.

## Staff

Staff have full Event Operations access for existing programmes.

This includes Volunteer Leader capabilities plus:

- registration review;
- roster imports and roster management;
- walk-in creation and editing;
- manual attendance corrections;
- bulk checkout;
- attendance monitoring and reconciliation;
- attendance and event report exports;
- volunteer ratings/reviews and insights;
- event-day operational reporting.

Staff cannot create, duplicate, structurally edit or delete programmes/events. Programme, opportunity, schedule, Event Guide and programme-rundown editing remain VolTeam/Admin functions.

## VolTeam

VolTeam has all KELUARGA operational and content access, including:

- all Event Operations;
- programme/event creation, duplication and editing;
- opportunity and Event Guide management;
- volunteer recruitment;
- content publishing;
- pathways and positions;
- points and badges;
- KELUARGA integration/batch tools.

VolTeam cannot manage staff access. This boundary prevents a VolTeam account from promoting itself to Admin and thereby acquiring MakLom access.

## Admin

Admin has all VolTeam capabilities plus KELUARGA staff-access administration.

KELUARGA Admin is also the source of MakLom administrator membership:

- promoting a staff member to KELUARGA Admin creates or updates their `public.app_members` record to active MakLom `admin`;
- changing an Admin to another KELUARGA access level removes their MakLom membership;
- both changes happen in the same database transaction;
- the system prevents removal of the final active KELUARGA Admin.

## Authentication and authorization

The same Supabase Auth identity is shared across both applications:

```text
Supabase Auth identity
        |
        +--> core.user_roles --------> KELUARGA access level
        |
        +--> public.app_members -----> MakLom access
```

Although Admin synchronizes both records, authorization is still enforced separately by each application and at the database/RLS or privileged server-action layer.

Legacy specialized KELUARGA role values remain in the PostgreSQL enum for migration compatibility only. They are no longer assignable through the application and are not part of the active access model.

## Operational rule

Assign the lowest access level required for the person's duties. Admin should be limited to staff who require both KELUARGA access administration and MakLom administration.
