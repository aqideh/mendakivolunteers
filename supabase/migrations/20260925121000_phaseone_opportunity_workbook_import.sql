create table if not exists public.phaseone_opportunity_imports (
  id uuid primary key default gen_random_uuid(),
  file_name text not null check (char_length(file_name) between 1 and 255),
  file_sha256 text not null unique check (file_sha256 ~ '^[0-9a-f]{64}$'),
  opportunity_count integer not null check (opportunity_count >= 0),
  shift_count integer not null check (shift_count >= 0),
  uploaded_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

alter table public.phaseone_opportunity_imports enable row level security;

drop policy if exists "Programme managers can read opportunity imports"
  on public.phaseone_opportunity_imports;
create policy "Programme managers can read opportunity imports"
on public.phaseone_opportunity_imports
for select
to authenticated
using (
  exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role in ('volteam','admin')
  )
);

grant select on public.phaseone_opportunity_imports to authenticated;

create or replace function public.phaseone_import_opportunity_workbook(
  p_file_name text,
  p_file_sha256 text,
  p_uploaded_by uuid,
  p_events jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  existing_batch public.phaseone_opportunity_imports%rowtype;
  event_record record;
  created_event_id uuid;
  opportunity_count integer := 0;
  shift_count integer := 0;
begin
  if auth.uid() is null or auth.uid() is distinct from p_uploaded_by then
    raise exception 'Authentication context does not match importer' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role in ('volteam','admin')
  ) then
    raise exception 'Programme management access is required' using errcode = '42501';
  end if;

  if nullif(btrim(p_file_name), '') is null or char_length(p_file_name) > 255 then
    raise exception 'Invalid workbook file name' using errcode = '22023';
  end if;

  if p_file_sha256 !~ '^[0-9a-f]{64}$' then
    raise exception 'Invalid workbook checksum' using errcode = '22023';
  end if;

  if jsonb_typeof(p_events) is distinct from 'array' then
    raise exception 'Events payload must be a JSON array' using errcode = '22023';
  end if;

  if jsonb_array_length(p_events) < 1 or jsonb_array_length(p_events) > 200 then
    raise exception 'Workbook must contain between 1 and 200 opportunities' using errcode = '22023';
  end if;

  select *
  into existing_batch
  from public.phaseone_opportunity_imports
  where file_sha256 = p_file_sha256;

  if found then
    return jsonb_build_object(
      'status', 'duplicate',
      'batch_id', existing_batch.id,
      'opportunity_count', existing_batch.opportunity_count,
      'shift_count', existing_batch.shift_count
    );
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_events) as incoming(slug text)
    join public.phaseone_events e on e.slug = incoming.slug
  ) then
    raise exception 'One or more slugs already exist in KELUARGA. Review the validation results before importing.'
      using errcode = '23505';
  end if;

  for event_record in
    select *
    from jsonb_to_recordset(p_events) as incoming(
      title text,
      slug text,
      opportunity_summary text,
      opportunity_description text,
      opportunity_image_url text,
      opportunity_category text,
      opportunity_eligibility text,
      registration_deadline timestamptz,
      opportunity_sort_order integer,
      venue text,
      navigation_destination text,
      attire_notes text,
      timeslots jsonb
    )
  loop
    if jsonb_typeof(event_record.timeslots) is distinct from 'array'
       or jsonb_array_length(event_record.timeslots) < 1
       or jsonb_array_length(event_record.timeslots) > 100 then
      raise exception 'Every imported opportunity needs between 1 and 100 shifts'
        using errcode = '22023';
    end if;

    insert into public.phaseone_events (
      title,
      slug,
      reporting_at,
      venue,
      navigation_destination,
      attire_notes,
      opportunity_summary,
      opportunity_description,
      opportunity_image_url,
      opportunity_category,
      opportunity_eligibility,
      registration_deadline,
      opportunity_sort_order,
      is_opportunity_published,
      is_published,
      created_by,
      updated_by
    )
    values (
      event_record.title,
      event_record.slug,
      (
        select min(t.starts_at)
        from jsonb_to_recordset(event_record.timeslots) as t(starts_at timestamptz)
      ),
      event_record.venue,
      event_record.navigation_destination,
      coalesce(nullif(btrim(event_record.attire_notes), ''), 'Wear your MENDAKI volunteer shirt if you have one.'),
      event_record.opportunity_summary,
      event_record.opportunity_description,
      event_record.opportunity_image_url,
      event_record.opportunity_category,
      event_record.opportunity_eligibility,
      event_record.registration_deadline,
      event_record.opportunity_sort_order,
      false,
      false,
      p_uploaded_by,
      p_uploaded_by
    )
    returning id into created_event_id;

    insert into public.phaseone_event_timeslots (
      event_id,
      label,
      starts_at,
      ends_at,
      status,
      sort_order,
      registration_capacity
    )
    select
      created_event_id,
      nullif(btrim(t.label), ''),
      t.starts_at,
      t.ends_at,
      coalesce(t.status, 'scheduled'),
      coalesce(t.sort_order, 0),
      t.registration_capacity
    from jsonb_to_recordset(event_record.timeslots) as t(
      label text,
      starts_at timestamptz,
      ends_at timestamptz,
      status text,
      sort_order integer,
      registration_capacity integer
    );

    opportunity_count := opportunity_count + 1;
    shift_count := shift_count + jsonb_array_length(event_record.timeslots);
  end loop;

  insert into public.phaseone_opportunity_imports (
    file_name,
    file_sha256,
    opportunity_count,
    shift_count,
    uploaded_by
  )
  values (
    p_file_name,
    p_file_sha256,
    opportunity_count,
    shift_count,
    p_uploaded_by
  )
  returning * into existing_batch;

  return jsonb_build_object(
    'status', 'imported',
    'batch_id', existing_batch.id,
    'opportunity_count', opportunity_count,
    'shift_count', shift_count
  );
end;
$$;

revoke all on function public.phaseone_import_opportunity_workbook(text,text,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.phaseone_import_opportunity_workbook(text,text,uuid,jsonb)
  to authenticated;
