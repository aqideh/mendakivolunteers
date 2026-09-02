begin;

alter table public.phaseone_events
  add column if not exists ymhub_activity_id text;

alter table public.phaseone_events
  drop constraint if exists phaseone_events_ymhub_activity_id_length;

alter table public.phaseone_events
  add constraint phaseone_events_ymhub_activity_id_length check (
    ymhub_activity_id is null
    or char_length(btrim(ymhub_activity_id)) between 1 and 128
  );

create index if not exists phaseone_events_ymhub_activity_id_idx
  on public.phaseone_events (ymhub_activity_id)
  where ymhub_activity_id is not null;

alter table public.phaseone_roster
  add column if not exists email_normalized text generated always as (
    nullif(lower(btrim(email)), '')
  ) stored;

create index if not exists phaseone_roster_email_event_idx
  on public.phaseone_roster (email_normalized, event_id)
  where email_normalized is not null;

comment on column public.phaseone_events.ymhub_activity_id is
  'Optional authoritative YM Hub activity identifier used to match imported registration snapshots to an app-managed event guide.';

comment on column public.phaseone_roster.email_normalized is
  'Generated lowercase roster email used only as a transitional verified-email event-guide access bridge until YM Hub registration snapshots are available.';

-- Event-guide content is now served only through authenticated server routes.
-- Revoke the historical public column grants so direct Data API calls cannot
-- bypass registration-aware route authorization.
drop policy if exists "Public can read published event operations"
  on public.phaseone_events;

revoke select (
  id,
  external_opportunity_id,
  title,
  slug,
  reporting_at,
  venue,
  whatsapp_url,
  is_published,
  created_at,
  updated_at,
  has_pin,
  briefing_available_at,
  has_sign_in_pin,
  has_sign_out_pin,
  navigation_destination,
  attire_notes,
  preparation_notes
) on public.phaseone_events from anon, authenticated;

commit;
