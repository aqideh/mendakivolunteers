drop function if exists public.list_phaseone_opportunities();

create index if not exists keluarga_notifications_registration_idx
  on public.keluarga_notifications(registration_id)
  where registration_id is not null;

create index if not exists keluarga_notifications_event_idx
  on public.keluarga_notifications(event_id)
  where event_id is not null;

create index if not exists keluarga_registration_history_changed_by_idx
  on public.keluarga_registration_status_history(changed_by)
  where changed_by is not null;

create index if not exists keluarga_registrations_reviewed_by_idx
  on public.keluarga_registrations(reviewed_by)
  where reviewed_by is not null;

comment on function core.ensure_current_keluarga_volunteer() is
  'Ensures a verified authenticated account has one native KELUARGA volunteer identity. YM Hub linkage is not required. Legacy email matches are used only for controlled one-to-one reconciliation.';
