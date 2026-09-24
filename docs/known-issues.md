# Known issues, limitations and technical debt

**Last reviewed:** 24 September 2026  
**Reference branch:** `staging`

This register reflects the approved KELUARGA + MakLom operating model. See `docs/architecture/keluarga-maklom-domain-architecture.md`.

## Open limitations and decisions

| Area | Status | Limitation / risk | Current handling | Next step |
|---|---|---|---|---|
| Shared migration history | Resolved on staging | The database merger originally introduced migration drift. | The three MakLom bootstrap migrations and all architecture migrations have now been recovered from Supabase's applied migration history and committed verbatim to the staging branch. | Keep migration history aligned during production promotion. |
| Production promotion | Staging only | The canonical identity/contribution/inbox changes in this architecture are not yet promoted to production. | KELUARGA staging is the verification environment. | Complete staging CI/UAT, then promote the same reviewed migrations and code deliberately. |
| FormSG ingestion | MakLom webhook code ready; external setup pending | MakLom contains the signed FormSG webhook and lead model, but the FormSG webhook configuration/secret still requires controlled production setup and verification. | FormSG remains the public volunteer CTA; duplicate response IDs are designed to be idempotent. | Configure the FormSG webhook secret/endpoint and run one controlled end-to-end submission. |
| Lead schema coordination | Resolved on staging | KELUARGA staging and MakLom briefly had two incompatible `volunteer_leads` proposals. | Staging now follows MakLom's text-ID/richer lifecycle contract and maps conversion to the canonical UUID. | Keep one shared contract and migrate production only from this reconciled design. |
| Approved contribution workflow UI | Database foundation live on staging | KELUARGA operational sessions create review candidates, but MakLom still needs a complete staff UI to approve/adjust/reject them. | Records remain pending/needs-review until MakLom acts; KELUARGA cannot self-approve hours. | Build MakLom contribution review queue before production launch of approved-hours display. |
| Profile-change review UI | Database foundation live on staging | KELUARGA mobile changes can enter the MakLom inbox, but MakLom still needs a dedicated review UI. | Changes retain source and audit context. | Build approve/reject/apply workflow in MakLom. |
| Insight/review longitudinal UI | Database foundation live on staging | Accepted insights/reviews enter a MakLom inbox but there is no finished cross-event review surface yet. | Event/source provenance is preserved and no permanent profile mutation occurs automatically. | Build MakLom inbox and longitudinal staff view. |
| Attendance-derived points | Intentionally paused | Previous reconciliation depended on YM Hub verified attendance, which is no longer the current operating model. | Manual audited staff-recognition points remain available. | Define an approved points rule based on MakLom-approved contribution records before reactivating automatic awards. |
| Dormant YM Hub objects | Technical debt / future infrastructure | `ymhub` and `integration.ymhub_*` schemas still exist and old code/docs may reference them. | Volunteer dashboard and Points no longer require YM Hub on staging. | Continue removing stale runtime references; retain schemas only as dormant future infrastructure until cleanup is approved. |
| Legacy KELUARGA recruitment tables | Historical only | `keluarga_recruitment_applications` remains in the database. | Public and admin routes are retired; write RPC privileges are revoked on staging. | Keep for provenance until retention requirements permit archival/removal. |
| Legacy KELUARGA contribution-credit table | Historical only | `keluarga_contribution_credits` predates the reviewed MakLom contribution ledger. | New attendance-derived hours use `volunteer_contributions`; legacy refresh RPC is retired on staging. | Migrate/retain historical rows as required, then remove the legacy write path permanently. |
| Legacy MakLom event/attendance tables | Historical | MakLom has its own older `events`, `event_shifts` and `attendance_log`. | KELUARGA `phaseone_events` is canonical for new operations; MakLom events can link by `keluarga_event_id`. | Define archival/read-model treatment before any table deletion. |
| Event Guide sensitive links | Access-policy decision | Guides may contain briefing or WhatsApp links and other operational information. | Existing database-backed access controls remain. | Confirm which guide sections may be public versus assignment/code/signed-link gated. |
| `phaseone` naming | Technical debt, not a bug | Historic identifiers remain in routes/modules/tables. | Kept stable to avoid breaking deployed contracts. | Rename only through a deliberate API/database migration. |

## Identity watch-points

- `core.volunteers.id` is the canonical person key.
- `public.volunteers.id` is a retained MakLom legacy/profile identifier, not a second canonical person identity.
- Email/mobile are matching evidence only.
- `attendance_person_key` is event-local continuity and must never become the organisation-wide identity.
- Ambiguous matches must enter a review workflow rather than being silently merged.

## Attendance and hours watch-points

- KELUARGA check-in/out is operational evidence.
- Completed sessions may populate `volunteer_contributions` as pending review candidates.
- Only MakLom-approved records are approved volunteer hours in the current operating model.
- A correction to an already-approved session must return the contribution to `needs_review`.
- Multi-shift reporting must distinguish unique people, roster rows, event participation, shift attendance and continuous attendance sessions.

## Review interpretation

Event reviews and insights describe a specific role/event context. They must retain provenance and must not be presented as permanent judgements of a volunteer's character or suitability without human review.

## Security boundaries

- KELUARGA authorization uses `core.user_roles`.
- MakLom authorization uses `public.app_members`.
- KELUARGA roles do not automatically grant MakLom access.
- Service-role credentials never belong in browser code.
- RLS remains a second enforcement layer for sensitive shared tables.
- Prospective-volunteer leads remain separate from canonical volunteers until deliberate conversion.

## Recently resolved

| Area | Resolved behaviour |
|---|---|
| Recruitment ownership | KELUARGA recruitment UI is retired; public volunteer CTAs use FormSG and MakLom owns lead review/conversion. |
| Canonical volunteer identity | Staging MakLom profiles now have a mandatory one-to-one `core_volunteer_id` and retained legacy alias. |
| New MakLom profile creation | Database triggers create/link the canonical UUID and legacy alias automatically. |
| Event ownership | MakLom legacy events can reference canonical KELUARGA events; KELUARGA owns new operational event records. |
| Contribution approval boundary | KELUARGA can generate/refresh candidates but cannot approve attendance-derived hours. |
| YM Hub dashboard dependency | Volunteer dashboard and Points page no longer require YM Hub projection state on staging. |
| Continuous shifts | Attendance supports continuity across adjacent shifts and final checkout. |
| Walk-in corrections | Corrections propagate across matching event shift rows while retaining event identity continuity. |

## Recording new defects

For a confirmed defect, record the affected feature, reproducible steps, expected/actual behaviour, account/event conditions, operational impact, data/security implications and required regression coverage. Identity, authorization, RLS and attendance-integrity defects are higher priority than cosmetic issues.
