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


drop policy if exists "Event managers can read private volunteer details" on public.volunteer_private_details;
drop policy if exists "Staff can read private volunteer details" on public.volunteer_private_details;
drop policy if exists "Volunteer team can read private volunteer details" on public.volunteer_private_details;
create policy "Volunteer team can read private volunteer details" on public.volunteer_private_details for select to authenticated using (exists(select 1 from core.user_accounts a join core.user_roles r on r.user_id=a.id where a.id=(select auth.uid()) and a.status='active' and r.role::text in ('volteam','admin')));
