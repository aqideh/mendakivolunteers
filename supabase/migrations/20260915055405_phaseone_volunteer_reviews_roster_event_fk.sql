alter table public.phaseone_volunteer_reviews
  drop constraint if exists phaseone_volunteer_reviews_roster_id_fkey;

alter table public.phaseone_roster
  add constraint phaseone_roster_id_event_uidx unique (id, event_id);

alter table public.phaseone_volunteer_reviews
  add constraint phaseone_volunteer_reviews_roster_event_fkey
  foreign key (roster_id, event_id)
  references public.phaseone_roster(id, event_id)
  on delete cascade;
