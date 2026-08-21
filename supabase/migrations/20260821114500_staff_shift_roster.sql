alter table public.phaseone_roster
  add column if not exists timeslot_id uuid references public.phaseone_event_timeslots(id) on delete restrict,
  add column if not exists tshirt_size text;

update public.phaseone_roster roster
set timeslot_id = first_timeslot.id
from lateral (
  select timeslot.id
  from public.phaseone_event_timeslots timeslot
  where timeslot.event_id = roster.event_id
  order by timeslot.starts_at asc, timeslot.sort_order asc, timeslot.id asc
  limit 1
) first_timeslot
where roster.timeslot_id is null;

do $$
begin
  if exists (select 1 from public.phaseone_roster where timeslot_id is null) then
    raise exception 'Every existing roster row must belong to an event timeslot before this migration can continue';
  end if;
end;
$$;

alter table public.phaseone_roster
  alter column timeslot_id set not null;

alter table public.phaseone_roster
  drop constraint if exists phaseone_roster_event_id_volunteer_key_key;

drop index if exists public.phaseone_roster_event_key_normalized_uidx;

create unique index phaseone_roster_event_timeslot_key_uidx
  on public.phaseone_roster (event_id, timeslot_id, volunteer_key_normalized);

create index phaseone_roster_event_timeslot_name_idx
  on public.phaseone_roster (event_id, timeslot_id, volunteer_name);

alter table public.phaseone_roster
  drop constraint if exists phaseone_roster_tshirt_size_length;

alter table public.phaseone_roster
  add constraint phaseone_roster_tshirt_size_length check (
    tshirt_size is null or char_length(btrim(tshirt_size)) between 1 and 20
  );

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

  if exists (
    select 1
    from jsonb_to_recordset(p_rows) as r(
      timeslot_id uuid,
      volunteer_key text,
      volunteer_name text,
      email text,
      mobile text,
      tshirt_size text
    )
    where r.timeslot_id is null
      or nullif(btrim(r.volunteer_key), '') is null
      or nullif(btrim(r.volunteer_name), '') is null
  ) then
    raise exception 'Roster contains a blank timeslot, volunteer ID or name';
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
    from jsonb_to_recordset(p_rows) as r(timeslot_id uuid, volunteer_key text)
    group by r.timeslot_id, lower(btrim(r.volunteer_key))
    having count(*) > 1
  ) then
    raise exception 'Roster contains duplicate volunteer IDs within the same shift';
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

  insert into public.phaseone_roster (
    event_id,
    timeslot_id,
    volunteer_key,
    volunteer_name,
    email,
    mobile,
    tshirt_size,
    uploaded_by,
    uploaded_at
  )
  select
    p_event_id,
    r.timeslot_id,
    btrim(r.volunteer_key),
    btrim(r.volunteer_name),
    nullif(btrim(r.email), ''),
    nullif(btrim(r.mobile), ''),
    nullif(btrim(r.tshirt_size), ''),
    p_uploaded_by,
    now()
  from jsonb_to_recordset(p_rows) as r(
    timeslot_id uuid,
    volunteer_key text,
    volunteer_name text,
    email text,
    mobile text,
    tshirt_size text
  )
  on conflict (event_id, timeslot_id, volunteer_key_normalized)
  do update set
    volunteer_key = excluded.volunteer_key,
    volunteer_name = excluded.volunteer_name,
    email = excluded.email,
    mobile = excluded.mobile,
    tshirt_size = excluded.tshirt_size,
    uploaded_by = excluded.uploaded_by,
    uploaded_at = excluded.uploaded_at;

  get diagnostics v_upserted_count = row_count;

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

comment on column public.phaseone_roster.timeslot_id is
  'The event day/shift this roster assignment belongs to. One volunteer may appear once per timeslot.';
comment on column public.phaseone_roster.tshirt_size is
  'Operational T-shirt size supplied with the event roster.';
