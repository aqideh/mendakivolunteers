begin;

alter table core.volunteers
  add column age smallint
  check (age is null or age between 0 and 120);

comment on column core.volunteers.age is
  'Latest known volunteer age supplied through trusted staff roster data. Integer age only; no date of birth is stored.';

alter table public.phaseone_roster
  add column age smallint
  check (age is null or age between 0 and 120);

comment on column public.phaseone_roster.age is
  'Volunteer age supplied for staff event operations and safeguarding. This is an event roster snapshot, not a date of birth.';

create or replace function public.phaseone_apply_roster_import(
  p_event_id uuid,
  p_mode text,
  p_file_name text,
  p_rows jsonb,
  p_uploaded_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_import_id uuid;
  v_replaced_count integer := 0;
  v_upserted_count integer := 0;
  v_row_count integer;
  v_row record;
  v_match_id uuid;
  v_seen_matches text[] := array[]::text[];
  v_seen_key text;
begin
  if p_mode not in ('merge', 'replace') then
    raise exception 'Unsupported roster import mode';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Roster payload must be a JSON array';
  end if;

  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 2000 then
    raise exception 'Roster must contain between 1 and 2000 rows';
  end if;
  if not exists (select 1 from public.phaseone_events where id = p_event_id) then
    raise exception 'Event not found';
  end if;
  if not exists (select 1 from auth.users where id = p_uploaded_by) then
    raise exception 'Staff user not found';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(
      timeslot_id uuid,
      volunteer_key text,
      volunteer_name text,
      email text,
      mobile text,
      age smallint,
      tshirt_size text,
      dietary_requirements text
    )
    where r.timeslot_id is null
      or nullif(btrim(r.volunteer_name), '') is null
  ) then
    raise exception 'Roster contains a blank timeslot or volunteer name';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(age smallint)
    where r.age is not null and (r.age < 0 or r.age > 120)
  ) then
    raise exception 'Roster contains an invalid age';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(timeslot_id uuid)
    left join public.phaseone_event_timeslots timeslot on timeslot.id = r.timeslot_id
    where timeslot.id is null or timeslot.event_id <> p_event_id
  ) then
    raise exception 'Roster contains a shift that does not belong to this event';
  end if;

  if exists (
    select 1
    from (
      select r.timeslot_id, 'id:' || lower(btrim(r.volunteer_key)) as identity_key
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, volunteer_key text)
      where nullif(btrim(r.volunteer_key), '') is not null

      union all

      select r.timeslot_id, 'email:' || lower(btrim(r.email))
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, email text)
      where nullif(btrim(r.email), '') is not null

      union all

      select r.timeslot_id, 'mobile:' || public.phaseone_canonical_mobile(r.mobile)
      from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, mobile text)
      where public.phaseone_canonical_mobile(r.mobile) is not null

      union all

      select r.timeslot_id, 'name:' || lower(btrim(regexp_replace(r.volunteer_name, '\s+', ' ', 'g')))
      from jsonb_to_recordset(p_rows) as r(
        timeslot_id uuid,
        volunteer_key text,
        volunteer_name text,
        email text,
        mobile text
      )
      where nullif(btrim(r.volunteer_key), '') is null
        and nullif(btrim(r.email), '') is null
        and public.phaseone_canonical_mobile(r.mobile) is null
    ) identities
    group by identities.timeslot_id, identities.identity_key
    having count(*) > 1
  ) then
    raise exception 'Roster contains duplicate volunteer identifiers within the same shift';
  end if;

  if p_mode = 'replace' then
    if exists (select 1 from public.phaseone_attendance where event_id = p_event_id) then
      raise exception 'A roster with attendance records cannot be replaced';
    end if;
    select count(*) into v_replaced_count
    from public.phaseone_roster
    where event_id = p_event_id;
    delete from public.phaseone_roster where event_id = p_event_id;
  end if;

  for v_row in
    select *
    from jsonb_to_recordset(p_rows) as r(
      timeslot_id uuid,
      volunteer_key text,
      volunteer_name text,
      email text,
      mobile text,
      age smallint,
      tshirt_size text,
      dietary_requirements text
    )
  loop
    v_match_id := public.phaseone_find_roster_match(
      p_event_id,
      v_row.timeslot_id,
      v_row.volunteer_key,
      v_row.email,
      v_row.mobile,
      v_row.volunteer_name
    );

    if v_match_id is not null then
      v_seen_key := v_row.timeslot_id::text || ':' || v_match_id::text;
      if v_seen_key = any(v_seen_matches) then
        raise exception 'Roster contains duplicate volunteer identities within the same shift';
      end if;
      v_seen_matches := array_append(v_seen_matches, v_seen_key);

      update public.phaseone_roster
      set volunteer_key = coalesce(nullif(btrim(v_row.volunteer_key), ''), volunteer_key),
          volunteer_name = btrim(v_row.volunteer_name),
          email = coalesce(nullif(btrim(v_row.email), ''), email),
          mobile = coalesce(nullif(btrim(v_row.mobile), ''), mobile),
          age = coalesce(v_row.age, age),
          tshirt_size = coalesce(nullif(btrim(v_row.tshirt_size), ''), tshirt_size),
          dietary_requirements = coalesce(nullif(btrim(v_row.dietary_requirements), ''), dietary_requirements),
          uploaded_by = p_uploaded_by,
          uploaded_at = now()
      where id = v_match_id;
    else
      insert into public.phaseone_roster (
        event_id,
        timeslot_id,
        volunteer_key,
        volunteer_name,
        email,
        mobile,
        age,
        tshirt_size,
        dietary_requirements,
        uploaded_by,
        uploaded_at
      ) values (
        p_event_id,
        v_row.timeslot_id,
        nullif(btrim(v_row.volunteer_key), ''),
        btrim(v_row.volunteer_name),
        nullif(btrim(v_row.email), ''),
        nullif(btrim(v_row.mobile), ''),
        v_row.age,
        nullif(btrim(v_row.tshirt_size), ''),
        nullif(btrim(v_row.dietary_requirements), ''),
        p_uploaded_by,
        now()
      )
      returning id into v_match_id;

      v_seen_matches := array_append(
        v_seen_matches,
        v_row.timeslot_id::text || ':' || v_match_id::text
      );
    end if;

    v_upserted_count := v_upserted_count + 1;
  end loop;

  insert into public.phaseone_roster_imports (
    event_id,
    mode,
    file_name,
    row_count,
    replaced_count,
    uploaded_by
  ) values (
    p_event_id,
    p_mode,
    left(p_file_name, 255),
    v_row_count,
    v_replaced_count,
    p_uploaded_by
  ) returning id into v_import_id;

  return jsonb_build_object(
    'import_id', v_import_id,
    'row_count', v_row_count,
    'upserted_count', v_upserted_count,
    'replaced_count', v_replaced_count
  );
end;
$$;

revoke all on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid)
  to service_role;

create or replace function core.sync_roster_age_to_volunteer()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, core
as $$
begin
  if new.volunteer_id is not null and new.age is not null then
    update core.volunteers
    set age = new.age,
        updated_at = now()
    where id = new.volunteer_id
      and age is distinct from new.age;
  end if;
  return new;
end;
$$;

comment on function core.sync_roster_age_to_volunteer() is
  'Copies a trusted roster age to the linked canonical volunteer when both age and volunteer_id are available.';

revoke all on function core.sync_roster_age_to_volunteer()
  from public, anon, authenticated;
grant execute on function core.sync_roster_age_to_volunteer()
  to service_role;

drop trigger if exists phaseone_roster_sync_age_to_volunteer on public.phaseone_roster;
create trigger phaseone_roster_sync_age_to_volunteer
after insert or update of age, volunteer_id on public.phaseone_roster
for each row execute function core.sync_roster_age_to_volunteer();

commit;
