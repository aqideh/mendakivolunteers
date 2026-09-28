begin;

create or replace function public.update_current_volunteer_home_location(
  p_postal_code text,
  p_address_line text,
  p_latitude numeric,
  p_longitude numeric,
  p_planning_area text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, core, audit
as $$
declare
  current_user_id uuid := auth.uid();
  current_volunteer_id uuid;
  clean_postal text := btrim(coalesce(p_postal_code, ''));
  clean_address text := btrim(coalesce(p_address_line, ''));
  clean_planning_area text := nullif(btrim(coalesce(p_planning_area, '')), '');
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if clean_postal !~ '^[0-9]{6}$' then
    raise exception 'A valid 6-digit Singapore postal code is required'
      using errcode = '22023';
  end if;

  if char_length(clean_address) < 3 or char_length(clean_address) > 500 then
    raise exception 'A verified address is required'
      using errcode = '22023';
  end if;

  if p_latitude is null
     or p_longitude is null
     or p_latitude not between 1.1 and 1.6
     or p_longitude not between 103.5 and 104.2 then
    raise exception 'Verified Singapore coordinates are required'
      using errcode = '22023';
  end if;

  select v.id
  into current_volunteer_id
  from core.volunteers v
  join core.user_accounts a on a.id = v.auth_user_id
  where v.auth_user_id = current_user_id
    and a.status = 'active';

  if current_volunteer_id is null then
    raise exception 'Active volunteer profile is required'
      using errcode = '42501';
  end if;

  insert into public.volunteer_private_details (
    volunteer_id,
    postal_code,
    address_line,
    latitude,
    longitude,
    neighbourhood,
    planning_area,
    address_verified_at
  )
  values (
    current_volunteer_id,
    clean_postal,
    clean_address,
    p_latitude,
    p_longitude,
    null,
    clean_planning_area,
    now()
  )
  on conflict (volunteer_id) do update
  set
    postal_code = excluded.postal_code,
    address_line = excluded.address_line,
    latitude = excluded.latitude,
    longitude = excluded.longitude,
    neighbourhood = null,
    planning_area = excluded.planning_area,
    address_verified_at = excluded.address_verified_at;

  perform audit.write_event(
    'volunteer.home_location_verified',
    'volunteer',
    current_volunteer_id::text,
    jsonb_build_object(
      'postal_code', clean_postal,
      'planning_area', clean_planning_area,
      'provider', 'OneMap',
      'electoral_boundary_version', 'GE2025'
    ),
    current_user_id,
    null
  );

  return current_volunteer_id;
end;
$$;

revoke all on function public.update_current_volunteer_home_location(
  text, text, numeric, numeric, text
) from public, anon, authenticated;

grant execute on function public.update_current_volunteer_home_location(
  text, text, numeric, numeric, text
) to authenticated, service_role;

comment on function public.update_current_volunteer_home_location(
  text, text, numeric, numeric, text
) is
  'Writes OneMap-verified home address coordinates for the current volunteer; GE2025 electoral geography is derived by database trigger.';

commit;
