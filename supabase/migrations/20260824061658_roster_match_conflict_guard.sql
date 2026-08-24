create or replace function public.phaseone_find_roster_match(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_email text,
  p_mobile text,
  p_volunteer_name text
) returns uuid
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_volunteer_key text := nullif(lower(btrim(coalesce(p_volunteer_key, ''))), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_mobile text := public.phaseone_canonical_mobile(p_mobile);
  v_name text := lower(btrim(regexp_replace(coalesce(p_volunteer_name, ''), '\s+', ' ', 'g')));
  v_matches uuid[];
  v_secondary_matches uuid[];
  v_match_count integer;
begin
  if v_volunteer_key is not null then
    select array_agg(roster.id order by roster.id)
    into v_matches
    from public.phaseone_roster roster
    where roster.event_id = p_event_id
      and roster.timeslot_id = p_timeslot_id
      and lower(btrim(roster.volunteer_key)) = v_volunteer_key;

    v_match_count := coalesce(array_length(v_matches, 1), 0);
    if v_match_count > 1 then
      raise exception 'Volunteer ID matches multiple roster records for this shift';
    end if;

    if v_match_count = 1 then
      select array_agg(candidate.id order by candidate.id)
      into v_secondary_matches
      from (
        select distinct roster.id
        from public.phaseone_roster roster
        where roster.event_id = p_event_id
          and roster.timeslot_id = p_timeslot_id
          and roster.id <> v_matches[1]
          and (
            (v_email is not null and lower(btrim(roster.email)) = v_email)
            or (v_mobile is not null and public.phaseone_canonical_mobile(roster.mobile) = v_mobile)
          )
      ) candidate;

      if coalesce(array_length(v_secondary_matches, 1), 0) > 0 then
        raise exception 'Volunteer identifiers point to different roster records for this shift';
      end if;

      return v_matches[1];
    end if;

    select array_agg(candidate.id order by candidate.id)
    into v_secondary_matches
    from (
      select distinct roster.id
      from public.phaseone_roster roster
      where roster.event_id = p_event_id
        and roster.timeslot_id = p_timeslot_id
        and (
          (v_email is not null and lower(btrim(roster.email)) = v_email)
          or (v_mobile is not null and public.phaseone_canonical_mobile(roster.mobile) = v_mobile)
        )
    ) candidate;

    v_match_count := coalesce(array_length(v_secondary_matches, 1), 0);
    if v_match_count > 1 then
      raise exception 'Volunteer details match multiple roster records for this shift; provide a more specific identifier';
    end if;
    if v_match_count = 1 then
      if exists (
        select 1
        from public.phaseone_roster roster
        where roster.id = v_secondary_matches[1]
          and nullif(btrim(roster.volunteer_key), '') is not null
      ) then
        raise exception 'Volunteer ID conflicts with an existing roster record for this shift';
      end if;
      return v_secondary_matches[1];
    end if;

    return null;
  end if;

  if v_email is not null or v_mobile is not null then
    select array_agg(candidate.id order by candidate.id)
    into v_matches
    from (
      select distinct roster.id
      from public.phaseone_roster roster
      where roster.event_id = p_event_id
        and roster.timeslot_id = p_timeslot_id
        and (
          (v_email is not null and lower(btrim(roster.email)) = v_email)
          or (v_mobile is not null and public.phaseone_canonical_mobile(roster.mobile) = v_mobile)
        )
    ) candidate;

    v_match_count := coalesce(array_length(v_matches, 1), 0);
    if v_match_count > 1 then
      raise exception 'Volunteer details match multiple roster records for this shift; provide a more specific identifier';
    end if;
    if v_match_count = 1 then
      return v_matches[1];
    end if;
    return null;
  end if;

  select array_agg(roster.id order by roster.id)
  into v_matches
  from public.phaseone_roster roster
  where roster.event_id = p_event_id
    and roster.timeslot_id = p_timeslot_id
    and lower(btrim(regexp_replace(roster.volunteer_name, '\s+', ' ', 'g'))) = v_name;

  v_match_count := coalesce(array_length(v_matches, 1), 0);
  if v_match_count > 1 then
    raise exception 'Volunteer name matches multiple roster records for this shift; provide a contact number, email or volunteer ID';
  end if;
  if v_match_count = 1 then
    return v_matches[1];
  end if;

  return null;
end;
$$;

revoke all on function public.phaseone_find_roster_match(uuid, uuid, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.phaseone_find_roster_match(uuid, uuid, text, text, text, text)
  to service_role;
