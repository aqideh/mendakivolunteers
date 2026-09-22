alter table public.phaseone_events
  add column opportunity_summary text,
  add column opportunity_description text,
  add column opportunity_image_url text,
  add column opportunity_category text,
  add column opportunity_eligibility text,
  add column registration_deadline timestamptz,
  add column is_opportunity_published boolean not null default false,
  add column opportunity_sort_order integer;

alter table public.phaseone_events
  add constraint phaseone_events_opportunity_summary_length
    check (opportunity_summary is null or char_length(btrim(opportunity_summary)) between 1 and 500),
  add constraint phaseone_events_opportunity_description_length
    check (opportunity_description is null or char_length(opportunity_description) <= 6000),
  add constraint phaseone_events_opportunity_image_url_https
    check (opportunity_image_url is null or opportunity_image_url ~ '^https://'),
  add constraint phaseone_events_opportunity_category_length
    check (opportunity_category is null or char_length(btrim(opportunity_category)) between 1 and 120),
  add constraint phaseone_events_opportunity_eligibility_length
    check (opportunity_eligibility is null or char_length(opportunity_eligibility) <= 2000),
  add constraint phaseone_events_opportunity_sort_order_nonnegative
    check (opportunity_sort_order is null or opportunity_sort_order >= 0);

create index phaseone_events_public_opportunity_idx
  on public.phaseone_events (opportunity_sort_order, id)
  where is_opportunity_published = true;

drop policy if exists "Public can read published KELUARGA programmes"
  on public.phaseone_events;
create policy "Public can read published KELUARGA programmes"
  on public.phaseone_events
  for select
  to anon, authenticated
  using (is_opportunity_published = true);

drop policy if exists "Public can read published KELUARGA programme shifts"
  on public.phaseone_event_timeslots;
create policy "Public can read published KELUARGA programme shifts"
  on public.phaseone_event_timeslots
  for select
  to anon, authenticated
  using (
    exists (
      select 1
      from public.phaseone_events as event
      where event.id = phaseone_event_timeslots.event_id
        and event.is_opportunity_published = true
    )
  );

revoke all on public.phaseone_events from anon, authenticated;
grant select (
  id,
  title,
  slug,
  venue,
  navigation_destination,
  opportunity_summary,
  opportunity_description,
  opportunity_image_url,
  opportunity_category,
  opportunity_eligibility,
  registration_deadline,
  is_opportunity_published,
  opportunity_sort_order
) on public.phaseone_events to anon, authenticated;

revoke all on public.phaseone_event_timeslots from anon, authenticated;
grant select (
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  status,
  sort_order
) on public.phaseone_event_timeslots to anon, authenticated;

drop function if exists public.list_phaseone_opportunities();

comment on column public.phaseone_events.opportunity_summary is
  'Public summary for the KELUARGA opportunity listing. The event record is the canonical programme/event record.';
comment on column public.phaseone_events.is_opportunity_published is
  'Controls whether this KELUARGA-owned programme/event is discoverable on the public Opportunities page.';
comment on column public.phaseone_events.external_opportunity_id is
  'Legacy Volunteer.gov.sg provenance only. Runtime opportunity discovery no longer depends on this field.';
comment on table public.phaseone_external_opportunities is
  'Retired Volunteer.gov.sg import history. Retained temporarily for historical provenance only; not a runtime opportunity source.';
comment on table public.phaseone_opportunity_overrides is
  'Retired imported-card override history. KELUARGA programme/event fields now own public opportunity content.';
