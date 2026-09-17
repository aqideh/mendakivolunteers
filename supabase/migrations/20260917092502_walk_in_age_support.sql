begin;

create or replace function public.phaseone_add_walk_in_volunteer(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint,
  p_tshirt_size text,
  p_dietary_requirements text,
  p_check_in boolean,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_result jsonb;
  v_roster_id uuid;
begin
  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120';
  end if;

  select public.phaseone_add_walk_in_volunteer(
    p_event_id,
    p_timeslot_id,
    p_volunteer_key,
    p_volunteer_name,
    p_email,
    p_mobile,
    p_tshirt_size,
    p_dietary_requirements,
    p_check_in,
    p_changed_by
  ) into v_result;

  if p_age is not null and nullif(v_result ->> 'roster_id', '') is not null then
    v_roster_id := (v_result ->> 'roster_id')::uuid;
    update public.phaseone_roster
    set age = p_age
    where id = v_roster_id
      and event_id = p_event_id;
  end if;

  return v_result;
end;
$$;

revoke all on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, smallint, text, text, boolean, uuid
) from public, anon, authenticated;
grant execute on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, smallint, text, text, boolean, uuid
) to service_role;

commit;
