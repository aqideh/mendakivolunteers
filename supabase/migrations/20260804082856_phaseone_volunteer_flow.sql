alter table public.phaseone_events
  add column navigation_destination text,
  add column attire_notes text not null
    default 'Wear your MENDAKI volunteer shirt if you have one.',
  add column preparation_notes text;

update public.phaseone_events
set navigation_destination =
  'Fernvale Community Club, 21 Sengkang West Avenue #01-01, Singapore 797650'
where slug = 'ri-jalankayu'
  and navigation_destination is null;

alter table public.phaseone_events
  add constraint phaseone_events_navigation_destination_length
    check (
      navigation_destination is null
      or char_length(trim(navigation_destination)) between 3 and 500
    ),
  add constraint phaseone_events_attire_notes_length
    check (char_length(trim(attire_notes)) between 1 and 500),
  add constraint phaseone_events_preparation_notes_length
    check (
      preparation_notes is null
      or char_length(trim(preparation_notes)) between 1 and 2000
    ),
  add constraint phaseone_events_published_location
    check (
      not is_published
      or (
        reporting_at is not null
        and venue is not null
        and navigation_destination is not null
      )
    );

grant select (
  navigation_destination,
  attire_notes,
  preparation_notes
) on public.phaseone_events to anon, authenticated;

comment on column public.phaseone_events.navigation_destination is
  'Exact address or map-search destination used to open Apple Maps and Google Maps.';
comment on column public.phaseone_events.attire_notes is
  'Event-specific attire reminder displayed in the volunteer preparation flow.';
comment on column public.phaseone_events.preparation_notes is
  'Optional event-specific preparation instructions displayed to volunteers.';
