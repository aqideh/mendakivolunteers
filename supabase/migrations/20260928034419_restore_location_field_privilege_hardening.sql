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
