alter table public.phaseone_roster
  add column volunteer_key_normalized text
  generated always as (lower(btrim(volunteer_key))) stored;

create unique index phaseone_roster_event_key_normalized_uidx
  on public.phaseone_roster (event_id, volunteer_key_normalized);

create table public.phaseone_roster_imports (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  mode text not null check (mode in ('merge', 'replace')),
  file_name text not null check (char_length(file_name) between 1 and 255),
  row_count integer not null check (row_count between 1 and 2000),
  replaced_count integer not null default 0 check (replaced_count >= 0),
  uploaded_by uuid not null references auth.users(id),
  uploaded_at timestamptz not null default now()
);

create index phaseone_roster_imports_event_uploaded_idx
  on public.phaseone_roster_imports (event_id, uploaded_at desc);

alter table public.phaseone_roster_imports enable row level security;
revoke all on public.phaseone_roster_imports from anon, authenticated;

create or replace function public.phaseone_apply_roster_import(
  p_event_id uuid, p_mode text, p_file_name text, p_rows jsonb, p_uploaded_by uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_import_id uuid; v_replaced_count integer := 0; v_upserted_count integer := 0; v_row_count integer;
begin
  if p_mode not in ('merge', 'replace') then raise exception 'Unsupported roster import mode'; end if;
  if jsonb_typeof(p_rows) <> 'array' then raise exception 'Roster payload must be a JSON array'; end if;
  v_row_count := jsonb_array_length(p_rows);
  if v_row_count < 1 or v_row_count > 2000 then raise exception 'Roster must contain between 1 and 2000 rows'; end if;
  if not exists (select 1 from public.phaseone_events where id = p_event_id) then raise exception 'Event not found'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(volunteer_key text, volunteer_name text, email text, mobile text) where nullif(btrim(r.volunteer_key), '') is null or nullif(btrim(r.volunteer_name), '') is null) then raise exception 'Roster contains a blank volunteer ID or name'; end if;
  if exists (select 1 from jsonb_to_recordset(p_rows) as r(volunteer_key text, volunteer_name text, email text, mobile text) group by lower(btrim(r.volunteer_key)) having count(*) > 1) then raise exception 'Roster contains duplicate volunteer IDs'; end if;
  if p_mode = 'replace' then
    if exists (select 1 from public.phaseone_attendance where event_id = p_event_id) then raise exception 'A roster with attendance records cannot be replaced'; end if;
    select count(*) into v_replaced_count from public.phaseone_roster where event_id = p_event_id;
    delete from public.phaseone_roster where event_id = p_event_id;
  end if;
  insert into public.phaseone_roster (event_id, volunteer_key, volunteer_name, email, mobile, uploaded_by, uploaded_at)
  select p_event_id, btrim(r.volunteer_key), btrim(r.volunteer_name), nullif(btrim(r.email), ''), nullif(btrim(r.mobile), ''), p_uploaded_by, now()
  from jsonb_to_recordset(p_rows) as r(volunteer_key text, volunteer_name text, email text, mobile text)
  on conflict (event_id, volunteer_key_normalized) do update set volunteer_key = excluded.volunteer_key, volunteer_name = excluded.volunteer_name, email = excluded.email, mobile = excluded.mobile, uploaded_by = excluded.uploaded_by, uploaded_at = excluded.uploaded_at;
  get diagnostics v_upserted_count = row_count;
  insert into public.phaseone_roster_imports (event_id, mode, file_name, row_count, replaced_count, uploaded_by)
  values (p_event_id, p_mode, left(p_file_name, 255), v_row_count, v_replaced_count, p_uploaded_by) returning id into v_import_id;
  return jsonb_build_object('import_id', v_import_id, 'row_count', v_row_count, 'upserted_count', v_upserted_count, 'replaced_count', v_replaced_count);
end;
$$;

revoke all on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid) from public, anon, authenticated;
grant execute on function public.phaseone_apply_roster_import(uuid, text, text, jsonb, uuid) to service_role;