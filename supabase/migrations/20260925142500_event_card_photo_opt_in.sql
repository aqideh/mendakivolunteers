alter table public.keluarga_volunteer_profiles
  add column if not exists event_card_photo_opt_in boolean not null default false;

comment on column public.keluarga_volunteer_profiles.event_card_photo_opt_in is
  'Volunteer-controlled consent for displaying their profile photo on signed-in opportunity cards when they have a confirmed registration.';
