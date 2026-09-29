begin;

create or replace function maklom_private.match_or_create_volunteer(
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_recruited_year smallint default null,
  p_interests text default null,
  p_tags text[] default '{}'::text[],
  p_notes text default null,
  p_origin text default 'manual'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $maklom$
declare
  v_actor uuid := auth.uid();
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
  v_email text := nullif(lower(btrim(coalesce(p_email, ''))), '');
  v_phone text := nullif(btrim(coalesce(p_phone, '')), '');
  v_profile_id text;
  v_core_id uuid;
  v_code text;
  v_match_count integer := 0;
  v_account_eligible boolean := false;
begin
  if v_actor is null then
    raise exception 'Authentication required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.app_members m
    where m.user_id = v_actor
      and m.active
      and m.role = any(array['editor'::text, 'admin'::text])
  ) then
    raise exception 'MakLom editor access required' using errcode = '42501';
  end if;

  if v_name is null then
    raise exception 'Volunteer name is required' using errcode = '22023';
  end if;

  if v_email is null and v_phone is null then
    raise exception 'Volunteer email or phone is required' using errcode = '22023';
  end if;

  v_account_eligible :=
    coalesce(nullif(btrim(p_origin), ''), 'manual') = 'formsg_lead'
    and v_email is not null;

  if v_email is not null then
    select count(*), min(v.id)
    into v_match_count, v_profile_id
    from public.volunteers v
    where lower(btrim(v.email)) = v_email;

    if v_match_count > 1 then
      raise exception 'Multiple volunteers already use this email; resolve duplicates first'
        using errcode = 'P0001';
    end if;
  end if;

  if v_match_count = 0 and v_phone is not null then
    select count(*), min(v.id)
    into v_match_count, v_profile_id
    from public.volunteers v
    where regexp_replace(coalesce(v.phone, ''), '[^0-9]', '', 'g')
          = regexp_replace(v_phone, '[^0-9]', '', 'g')
      and lower(btrim(v.name)) = lower(v_name);

    if v_match_count > 1 then
      raise exception 'Multiple volunteers match this name and phone; resolve duplicates first'
        using errcode = 'P0001';
    end if;
  end if;

  if v_match_count = 1 and v_profile_id is not null then
    select v.core_volunteer_id, c.volunteer_code
    into v_core_id, v_code
    from public.volunteers v
    join core.volunteers c on c.id = v.core_volunteer_id
    where v.id = v_profile_id;

    if v_account_eligible then
      update core.volunteers
      set account_access_eligible = true,
          primary_email_normalized = coalesce(primary_email_normalized, v_email)
      where id = v_core_id;
    end if;

    return jsonb_build_object(
      'status', 'linked_existing',
      'profile_id', v_profile_id,
      'core_volunteer_id', v_core_id,
      'volunteer_code', v_code
    );
  end if;

  insert into core.volunteers (
    display_name,
    primary_email_normalized,
    mobile,
    account_access_eligible
  )
  values (
    v_name,
    v_email,
    v_phone,
    v_account_eligible
  )
  returning id, volunteer_code into v_core_id, v_code;

  v_profile_id := gen_random_uuid()::text;

  insert into public.volunteers (
    id,
    core_volunteer_id,
    name,
    phone,
    email,
    recruited_year,
    interests,
    tags,
    notes,
    profile_origin
  )
  values (
    v_profile_id,
    v_core_id,
    v_name,
    v_phone,
    v_email,
    p_recruited_year,
    nullif(btrim(coalesce(p_interests, '')), ''),
    coalesce(p_tags, '{}'::text[]),
    nullif(btrim(coalesce(p_notes, '')), ''),
    coalesce(nullif(btrim(p_origin), ''), 'manual')
  );

  return jsonb_build_object(
    'status', 'created',
    'profile_id', v_profile_id,
    'core_volunteer_id', v_core_id,
    'volunteer_code', v_code
  );
end;
$maklom$;

create or replace function public.maklom_match_or_create_volunteer(
  p_name text,
  p_email text default null,
  p_phone text default null,
  p_recruited_year smallint default null,
  p_interests text default null,
  p_tags text[] default '{}'::text[],
  p_notes text default null,
  p_origin text default 'manual'
)
returns jsonb
language plpgsql
set search_path = ''
as $$
begin
  return maklom_private.match_or_create_volunteer(
    p_name,
    p_email,
    p_phone,
    p_recruited_year,
    p_interests,
    p_tags,
    p_notes,
    p_origin
  );
end;
$$;

grant usage on schema maklom_private to authenticated, service_role;
grant execute on function maklom_private.match_or_create_volunteer(
  text,text,text,smallint,text,text[],text,text
) to authenticated, service_role;

revoke all on function public.maklom_match_or_create_volunteer(
  text,text,text,smallint,text,text[],text,text
) from public, anon;
grant execute on function public.maklom_match_or_create_volunteer(
  text,text,text,smallint,text,text[],text,text
) to authenticated, service_role;

commit;
