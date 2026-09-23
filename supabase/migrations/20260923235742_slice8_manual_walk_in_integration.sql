create or replace function public.phaseone_add_manual_walk_in_volunteer(
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
  p_changed_by uuid,
  p_integrate_volunteers boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  event_scope text;
  base_result jsonb;
  roster_id uuid;
  resolved jsonb;
  resolved_volunteer_id uuid;
  resolved_volunteer_code text;
begin
  select operations_scope
  into event_scope
  from public.phaseone_events
  where id = p_event_id
  for update;

  if event_scope is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if event_scope not in ('manual_isolated', 'manual_integrated') then
    raise exception 'This walk-in mode is only available for manual Event Operations events'
      using errcode = 'P0001';
  end if;
  if p_integrate_volunteers is distinct from (event_scope = 'manual_integrated') then
    raise exception 'Walk-in integration choice does not match the manual event data scope'
      using errcode = 'P0001';
  end if;

  base_result := public.phaseone_add_walk_in_volunteer(
    p_event_id,
    p_timeslot_id,
    p_volunteer_key,
    p_volunteer_name,
    p_email,
    p_mobile,
    p_age,
    p_tshirt_size,
    p_dietary_requirements,
    p_check_in,
    p_changed_by
  );

  roster_id := nullif(base_result ->> 'roster_id', '')::uuid;

  if p_integrate_volunteers and roster_id is not null then
    resolved := core.resolve_manual_roster_volunteer(
      p_volunteer_key,
      p_volunteer_name,
      p_email,
      p_mobile,
      p_age
    );
    resolved_volunteer_id := (resolved ->> 'volunteer_id')::uuid;
    resolved_volunteer_code := resolved ->> 'volunteer_code';

    update public.phaseone_roster
    set
      volunteer_id = resolved_volunteer_id,
      volunteer_key = coalesce(nullif(btrim(volunteer_key), ''), resolved_volunteer_code),
      source_assignment_status = 'manual_integrated'
    where id = roster_id
      and event_id = p_event_id;

    base_result := base_result || jsonb_build_object(
      'volunteer_id', resolved_volunteer_id,
      'volunteer_code', resolved_volunteer_code,
      'volunteer_created', coalesce((resolved ->> 'created')::boolean, false)
    );
  end if;

  return base_result;
end;
$$;

revoke all on function public.phaseone_add_manual_walk_in_volunteer(
  uuid,uuid,text,text,text,text,smallint,text,text,boolean,uuid,boolean
) from public, anon, authenticated;
grant execute on function public.phaseone_add_manual_walk_in_volunteer(
  uuid,uuid,text,text,text,text,smallint,text,text,boolean,uuid,boolean
) to service_role;
