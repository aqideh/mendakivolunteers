create index if not exists professional_events_created_by_idx
  on content.professional_events(created_by)
  where created_by is not null;

create index if not exists professional_events_updated_by_idx
  on content.professional_events(updated_by)
  where updated_by is not null;
