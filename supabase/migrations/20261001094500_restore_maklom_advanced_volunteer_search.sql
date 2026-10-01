begin;

alter table public.volunteers
  add column if not exists neighbourhood text,
  add column if not exists planning_area text,
  add column if not exists electoral_division text;

grant select (event_id) on public.phaseone_roster to authenticated;

create or replace view public.maklom_volunteer_search_v2
with (security_invoker = true)
as
with attended as (
  select
    p.core_volunteer_id,
    coalesce(
      array_agg(distinct p.event_title order by p.event_title)
        filter (where nullif(btrim(p.event_title),'') is not null),
      '{}'::text[]
    ) as attended_events
  from public.maklom_event_participation p
  group by p.core_volunteer_id
),
registered as (
  select
    r.volunteer_id as core_volunteer_id,
    count(distinct r.event_id)::integer as registered_event_count,
    coalesce(
      array_agg(distinct e.title order by e.title)
        filter (where nullif(btrim(e.title),'') is not null),
      '{}'::text[]
    ) as registered_events
  from public.phaseone_roster r
  join public.phaseone_events e on e.id=r.event_id
  where r.volunteer_id is not null
  group by r.volunteer_id
)
select
  v.id,
  v.core_volunteer_id,
  cv.volunteer_code,
  v.name,
  v.nric,
  v.email,
  v.phone,
  v.gender,
  v.address,
  v.neighbourhood,
  v.planning_area,
  v.electoral_division,
  v.recruited_year,
  v.chat_session,
  v.chat_session_date,
  v.interests,
  v.languages_spoken,
  v.programmes_registered,
  v.tags,
  v.emergency_name,
  v.emergency_phone,
  v.shirt_size,
  v.dietary,
  v.notes,
  v.updated_at,
  v.row_version,
  coalesce(i.event_count,0)::integer as attended_event_count,
  coalesce(r.registered_event_count,0)::integer as registered_event_count,
  coalesce(i.historical_credited_minutes,0)::bigint
    + coalesce(i.approved_keluarga_minutes,0)::bigint as total_credited_minutes,
  i.first_event_date,
  i.last_event_date as last_active,
  coalesce(i.events_last_90d,0)::integer as events_last_90d,
  coalesce(i.active_last_90d,false) as active_last_90d,
  coalesce(a.attended_events,'{}'::text[]) as attended_events,
  coalesce(r.registered_events,'{}'::text[]) as registered_events,
  coalesce((select min(tag) from unnest(v.tags) tag),'') as first_tag,
  lower(concat_ws(' ',
    cv.volunteer_code,v.name,v.nric,v.phone,v.email,v.gender,v.address,
    v.neighbourhood,v.planning_area,v.electoral_division,v.recruited_year::text,
    v.chat_session,v.chat_session_date::text,v.interests,v.languages_spoken,
    array_to_string(v.programmes_registered,' '),array_to_string(v.tags,' '),
    v.emergency_name,v.emergency_phone,v.shirt_size,v.dietary,v.notes,
    array_to_string(coalesce(a.attended_events,'{}'::text[]),' '),
    array_to_string(coalesce(r.registered_events,'{}'::text[]),' ')
  )) as search_text
from public.volunteers v
join core.volunteers cv on cv.id=v.core_volunteer_id
left join public.maklom_volunteer_intelligence i on i.core_volunteer_id=v.core_volunteer_id
left join attended a on a.core_volunteer_id=v.core_volunteer_id
left join registered r on r.core_volunteer_id=v.core_volunteer_id;

revoke all on public.maklom_volunteer_search_v2 from anon;
grant select on public.maklom_volunteer_search_v2 to authenticated,service_role;

create or replace function public.maklom_volunteer_query_matches(
  p_row jsonb,
  p_node jsonb
)
returns boolean
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_type text := coalesce(p_node->>'type','group');
  v_join text := upper(coalesce(p_node->>'operator','AND'));
  v_field text;
  v_operator text;
  v_value jsonb;
  v_actual_text text;
  v_expected_text text;
  v_actual_number numeric;
  v_low numeric;
  v_high numeric;
  v_actual_date date;
  v_date_low date;
  v_date_high date;
  v_child jsonb;
  v_values text[];
  v_actual_values text[];
begin
  if p_node is null or p_node='null'::jsonb then
    return true;
  end if;

  if v_type='group' then
    if jsonb_typeof(p_node->'children') <> 'array'
       or jsonb_array_length(p_node->'children')=0 then
      return true;
    end if;

    if v_join='OR' then
      for v_child in select value from jsonb_array_elements(p_node->'children')
      loop
        if public.maklom_volunteer_query_matches(p_row,v_child) then
          return true;
        end if;
      end loop;
      return false;
    end if;

    for v_child in select value from jsonb_array_elements(p_node->'children')
    loop
      if not public.maklom_volunteer_query_matches(p_row,v_child) then
        return false;
      end if;
    end loop;
    return true;
  end if;

  if v_type <> 'condition' then
    return true;
  end if;

  v_field := p_node->>'field';
  v_operator := p_node->>'operator';
  v_value := p_node->'value';

  if v_field in (
    'anyText','name','nric','phone','email','gender','address','neighbourhood',
    'planning_area','electoral_division','chat_session','interests',
    'languages_spoken','emergency_name','emergency_phone','shirt_size','dietary','notes'
  ) then
    v_actual_text := lower(coalesce(
      case v_field
        when 'anyText' then p_row->>'search_text'
        else p_row->>v_field
      end,''
    ));
    v_expected_text := lower(coalesce(v_value#>>'{}',''));

    if v_operator='isEmpty' then return btrim(v_actual_text)=''; end if;
    if v_operator='isNotEmpty' then return btrim(v_actual_text)<>''; end if;
    if v_expected_text='' then return true; end if;
    if v_operator='contains' then return position(v_expected_text in v_actual_text)>0; end if;
    if v_operator='notContains' then return position(v_expected_text in v_actual_text)=0; end if;
    if v_operator='equals' then return v_actual_text=v_expected_text; end if;
    if v_operator='notEquals' then return v_actual_text<>v_expected_text; end if;
    if v_operator='startsWith' then return left(v_actual_text,length(v_expected_text))=v_expected_text; end if;
    return true;
  end if;

  if v_field in ('programmes_registered','tags','attended_events','registered_events') then
    select coalesce(array_agg(lower(value)),'{}'::text[])
    into v_actual_values
    from jsonb_array_elements_text(coalesce(p_row->v_field,'[]'::jsonb));

    select coalesce(array_agg(lower(value)),'{}'::text[])
    into v_values
    from jsonb_array_elements_text(
      case when jsonb_typeof(v_value)='array' then v_value else '[]'::jsonb end
    );

    if v_operator='isEmpty' then return cardinality(v_actual_values)=0; end if;
    if v_operator='isNotEmpty' then return cardinality(v_actual_values)>0; end if;
    if cardinality(v_values)=0 then return true; end if;

    if v_operator in ('hasAny','registeredAny','attendedAny') then
      return exists(select 1 from unnest(v_values) x where x=any(v_actual_values));
    end if;
    if v_operator in ('hasAll','registeredAll','attendedAll') then
      return not exists(select 1 from unnest(v_values) x where not (x=any(v_actual_values)));
    end if;
    if v_operator in ('hasNone','registeredNone','attendedNone') then
      return not exists(select 1 from unnest(v_values) x where x=any(v_actual_values));
    end if;
    return true;
  end if;

  if v_field in (
    'recruited_year','total_hours','attended_event_count','registered_event_count','events_last_90d'
  ) then
    begin
      v_actual_number := case
        when v_field='total_hours' then coalesce((p_row->>'total_credited_minutes')::numeric,0)/60.0
        else nullif(p_row->>v_field,'')::numeric
      end;
    exception when others then
      v_actual_number := null;
    end;

    if v_operator='isEmpty' then
      return v_actual_number is null or (v_field='total_hours' and v_actual_number=0);
    end if;
    if v_operator='isNotEmpty' then
      return v_actual_number is not null and (v_field<>'total_hours' or v_actual_number>0);
    end if;

    if v_operator='between' then
      begin
        v_low := nullif(v_value->>0,'')::numeric;
        v_high := nullif(v_value->>1,'')::numeric;
      exception when others then
        return true;
      end;
      if v_low is null or v_high is null then return true; end if;
      if v_actual_number is null then return false; end if;
      return v_actual_number between least(v_low,v_high) and greatest(v_low,v_high);
    end if;

    begin
      v_low := nullif(v_value#>>'{}','')::numeric;
    exception when others then
      return true;
    end;
    if v_low is null then return true; end if;
    if v_actual_number is null then return false; end if;
    if v_operator='eq' then return v_actual_number=v_low; end if;
    if v_operator='ne' then return v_actual_number<>v_low; end if;
    if v_operator='gt' then return v_actual_number>v_low; end if;
    if v_operator='gte' then return v_actual_number>=v_low; end if;
    if v_operator='lt' then return v_actual_number<v_low; end if;
    if v_operator='lte' then return v_actual_number<=v_low; end if;
    return true;
  end if;

  if v_field in ('chat_session_date','first_event_date','last_active') then
    begin
      v_actual_date := nullif(p_row->>v_field,'')::date;
    exception when others then
      v_actual_date := null;
    end;

    if v_operator='isEmpty' then return v_actual_date is null; end if;
    if v_operator='isNotEmpty' then return v_actual_date is not null; end if;
    if v_actual_date is null then return false; end if;

    if v_operator='between' then
      begin
        v_date_low := nullif(v_value->>0,'')::date;
        v_date_high := nullif(v_value->>1,'')::date;
      exception when others then
        return true;
      end;
      if v_date_low is null or v_date_high is null then return true; end if;
      return v_actual_date between least(v_date_low,v_date_high) and greatest(v_date_low,v_date_high);
    end if;

    begin
      v_date_low := nullif(v_value#>>'{}','')::date;
    exception when others then
      return true;
    end;
    if v_date_low is null then return true; end if;
    if v_operator='on' then return v_actual_date=v_date_low; end if;
    if v_operator='before' then return v_actual_date<v_date_low; end if;
    if v_operator='after' then return v_actual_date>v_date_low; end if;
    return true;
  end if;

  if v_field='activity' then
    if v_operator='hasAttendance' then return coalesce((p_row->>'attended_event_count')::integer,0)>0; end if;
    if v_operator='noAttendance' then return coalesce((p_row->>'attended_event_count')::integer,0)=0; end if;
    if v_operator='active90' then return coalesce((p_row->>'events_last_90d')::integer,0)>0; end if;
    return true;
  end if;

  return true;
end;
$$;

revoke all on function public.maklom_volunteer_query_matches(jsonb,jsonb) from public,anon;
grant execute on function public.maklom_volunteer_query_matches(jsonb,jsonb) to authenticated,service_role;

create or replace function public.maklom_search_volunteers(
  p_query jsonb default '{"type":"group","operator":"AND","children":[]}'::jsonb,
  p_search text default '',
  p_sort text default 'name-asc',
  p_page integer default 0,
  p_page_size integer default 50
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_page integer := greatest(coalesce(p_page,0),0);
  v_page_size integer := least(greatest(coalesce(p_page_size,50),1),500);
  v_search text := lower(btrim(coalesce(p_search,'')));
  v_count bigint;
  v_rows jsonb;
begin
  if auth.uid() is null or not exists (
    select 1 from public.app_members m
    where m.user_id=auth.uid() and m.active
  ) then
    raise exception 'MakLom access is required' using errcode='42501';
  end if;

  with filtered as (
    select d.*
    from public.maklom_volunteer_search_v2 d
    where (v_search='' or position(v_search in d.search_text)>0)
      and public.maklom_volunteer_query_matches(to_jsonb(d),coalesce(p_query,'{}'::jsonb))
  )
  select count(*) into v_count from filtered;

  with filtered as (
    select d.*
    from public.maklom_volunteer_search_v2 d
    where (v_search='' or position(v_search in d.search_text)>0)
      and public.maklom_volunteer_query_matches(to_jsonb(d),coalesce(p_query,'{}'::jsonb))
  ),
  paged as (
    select *
    from filtered
    order by
      case when p_sort='name-asc' then lower(name) end asc nulls last,
      case when p_sort='name-desc' then lower(name) end desc nulls last,
      case when p_sort='tag' then lower(first_tag) end asc nulls last,
      case when p_sort='hours' then total_credited_minutes end desc nulls last,
      case when p_sort='last-active' then last_active end desc nulls last,
      case when p_sort='events-attended' then attended_event_count end desc nulls last,
      case when p_sort='events-registered' then registered_event_count end desc nulls last,
      case when p_sort='recruited-year' then recruited_year end desc nulls last,
      case when p_sort='newest' then updated_at end desc nulls last,
      case when p_sort='oldest' then updated_at end asc nulls last,
      lower(name) asc
    offset v_page*v_page_size
    limit v_page_size
  )
  select coalesce(jsonb_agg(to_jsonb(paged) - 'search_text'),'[]'::jsonb)
  into v_rows
  from paged;

  return jsonb_build_object(
    'rows',coalesce(v_rows,'[]'::jsonb),
    'count',coalesce(v_count,0),
    'page',v_page,
    'pageSize',v_page_size
  );
end;
$$;

revoke all on function public.maklom_search_volunteers(jsonb,text,text,integer,integer) from public,anon;
grant execute on function public.maklom_search_volunteers(jsonb,text,text,integer,integer) to authenticated,service_role;

create or replace function public.maklom_volunteer_search_options()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $$
  select case
    when auth.uid() is null or not exists (
      select 1 from public.app_members m
      where m.user_id=auth.uid() and m.active
    ) then jsonb_build_object('error','MakLom access is required')
    else jsonb_build_object(
      'tags',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct tag as x
          from public.maklom_volunteer_search_v2 d, unnest(d.tags) tag
          where nullif(btrim(tag),'') is not null
        ) s
      ),'[]'::jsonb),
      'programmes',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct programme as x
          from public.maklom_volunteer_search_v2 d, unnest(d.programmes_registered) programme
          where nullif(btrim(programme),'') is not null
        ) s
      ),'[]'::jsonb),
      'genders',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct gender as x
          from public.maklom_volunteer_search_v2
          where nullif(btrim(gender),'') is not null
        ) s
      ),'[]'::jsonb),
      'shirtSizes',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct shirt_size as x
          from public.maklom_volunteer_search_v2
          where nullif(btrim(shirt_size),'') is not null
        ) s
      ),'[]'::jsonb),
      'planningAreas',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct planning_area as x
          from public.maklom_volunteer_search_v2
          where nullif(btrim(planning_area),'') is not null
        ) s
      ),'[]'::jsonb),
      'electoralDivisions',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct electoral_division as x
          from public.maklom_volunteer_search_v2
          where nullif(btrim(electoral_division),'') is not null
        ) s
      ),'[]'::jsonb),
      'events',coalesce((
        select jsonb_agg(x order by x)
        from (
          select distinct event_title as x
          from public.maklom_event_participation
          where nullif(btrim(event_title),'') is not null
          union
          select distinct title as x
          from public.phaseone_events
          where nullif(btrim(title),'') is not null
        ) s
      ),'[]'::jsonb)
    )
  end;
$$;

revoke all on function public.maklom_volunteer_search_options() from public,anon;
grant execute on function public.maklom_volunteer_search_options() to authenticated,service_role;

comment on view public.maklom_volunteer_search_v2 is
  'Canonical MakLom Central Database search projection. Combines profile fields, unified event participation, roster registration signals and credited hours.';
comment on function public.maklom_search_volunteers(jsonb,text,text,integer,integer) is
  'Server-side paginated MakLom volunteer search supporting a whitelisted Boolean query tree.';
comment on function public.maklom_volunteer_query_matches(jsonb,jsonb) is
  'Evaluates a whitelisted MakLom volunteer Boolean query node against a search projection row.';

commit;
