begin;

create or replace function public.clear_volunteer_location_derivatives()
returns trigger
language plpgsql
set search_path = pg_catalog, public
as $$
begin
  if old.postal_code is distinct from new.postal_code
     or old.address_line is distinct from new.address_line then
    new.latitude := null;
    new.longitude := null;
    new.neighbourhood := null;
    new.planning_area := null;
    new.electoral_division := null;
    new.electoral_boundary_version := null;
    new.address_verified_at := null;
  end if;
  return new;
end;
$$;

drop trigger if exists volunteer_private_details_clear_location
  on public.volunteer_private_details;
create trigger volunteer_private_details_clear_location
before update on public.volunteer_private_details
for each row execute function public.clear_volunteer_location_derivatives();

revoke insert, update on public.volunteer_private_details from authenticated;

grant insert (
  volunteer_id,
  date_of_birth,
  postal_code,
  address_line,
  dietary_requirements,
  food_allergies,
  no_known_food_allergies,
  tshirt_size,
  highest_qualification,
  institution,
  field_of_study,
  languages_spoken,
  emergency_contact_name,
  emergency_contact_mobile
) on public.volunteer_private_details to authenticated;

grant update (
  date_of_birth,
  postal_code,
  address_line,
  dietary_requirements,
  food_allergies,
  no_known_food_allergies,
  tshirt_size,
  highest_qualification,
  institution,
  field_of_study,
  languages_spoken,
  emergency_contact_name,
  emergency_contact_mobile
) on public.volunteer_private_details to authenticated;

comment on function public.clear_volunteer_location_derivatives() is
  'Clears server-derived geographic fields whenever a volunteer changes their postal code or address.';

commit;
