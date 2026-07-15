begin;

alter table content.opportunities
  add constraint opportunities_physical_location_required
  check (is_remote or location_name is not null) not valid;

alter table content.opportunities
  validate constraint opportunities_physical_location_required;

commit;
