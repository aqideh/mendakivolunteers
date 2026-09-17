begin;

create or replace function core.apply_ymhub_import_batch(
  p_period_start date,
  p_period_end date,
  p_created_by uuid,
  p_template_version text,
  p_files jsonb,
  p_person_accounts jsonb,
  p_activities jsonb,
  p_shifts jsonb,
  p_assignments jsonb,
  p_issues jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, core, integration, ymhub, public
as $$
declare
  v_batch_id uuid;
  v_file_id uuid;
  v_person_file_id uuid;
  v_activity_file_id uuid;
  v_shift_file_id uuid;
  v_assignment_file_id uuid;
  v_now timestamptz := now();
  v_file jsonb;
  v_issue jsonb;
  v_issue_file_id uuid;
  v_person_inserted integer := 0;
  v_person_updated integer := 0;
  v_activity_inserted integer := 0;
  v_activity_updated integer := 0;
  v_shift_inserted integer := 0;
  v_shift_updated integer := 0;
  v_assignment_inserted integer := 0;
  v_assignment_updated integer := 0;
begin
  if p_period_start is null or p_period_end is null or p_period_end < p_period_start then
    raise exception 'Invalid YM Hub reporting period' using errcode = '22023';
  end if;

  if jsonb_typeof(p_files) <> 'array'
    or jsonb_array_length(p_files) <> 4
    or jsonb_typeof(p_person_accounts) <> 'array'
    or jsonb_typeof(p_activities) <> 'array'
    or jsonb_typeof(p_shifts) <> 'array'
    or jsonb_typeof(p_assignments) <> 'array'
    or jsonb_typeof(coalesce(p_issues, '[]'::jsonb)) <> 'array' then
    raise exception 'Invalid YM Hub batch payload' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_files) as incoming(file)
    join integration.ymhub_import_files as existing
      on existing.dataset = incoming.file ->> 'dataset'
     and existing.file_sha256 = incoming.file ->> 'sha256'
  ) then
    raise exception 'One or more YM Hub files have already been imported'
      using errcode = '23505';
  end if;

  insert into integration.ymhub_import_batches (
    period_start,
    period_end,
    status,
    created_by,
    notes
  ) values (
    p_period_start,
    p_period_end,
    'validated',
    p_created_by,
    'Validated and committed by the KELUARGA inbound YM Hub importer.'
  )
  returning id into v_batch_id;

  for v_file in select value from jsonb_array_elements(p_files)
  loop
    if coalesce(v_file ->> 'dataset', '') not in (
      'person_accounts',
      'volunteer_initiatives',
      'job_position_shifts',
      'job_position_assignments'
    ) then
      raise exception 'Invalid YM Hub dataset name' using errcode = '22023';
    end if;

    insert into integration.ymhub_import_files (
      batch_id,
      dataset,
      file_name,
      file_sha256,
      template_version,
      status,
      row_count,
      inserted_count,
      updated_count,
      exception_count,
      imported_at
    ) values (
      v_batch_id,
      v_file ->> 'dataset',
      v_file ->> 'file_name',
      v_file ->> 'sha256',
      p_template_version,
      'validated',
      coalesce((v_file ->> 'row_count')::integer, 0),
      0,
      0,
      coalesce((v_file ->> 'exception_count')::integer, 0),
      v_now
    )
    returning id into v_file_id;

    case v_file ->> 'dataset'
      when 'person_accounts' then v_person_file_id := v_file_id;
      when 'volunteer_initiatives' then v_activity_file_id := v_file_id;
      when 'job_position_shifts' then v_shift_file_id := v_file_id;
      when 'job_position_assignments' then v_assignment_file_id := v_file_id;
    end case;
  end loop;

  if v_person_file_id is null
    or v_activity_file_id is null
    or v_shift_file_id is null
    or v_assignment_file_id is null then
    raise exception 'YM Hub batch must contain all four required datasets'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_person_updated
  from jsonb_array_elements(p_person_accounts) as incoming(person)
  join core.volunteers as existing
    on existing.ymhub_volunteer_id = incoming.person ->> 'ymhub_volunteer_id';
  v_person_inserted := jsonb_array_length(p_person_accounts) - v_person_updated;

  insert into core.volunteers (
    ymhub_volunteer_id,
    display_name,
    primary_email_normalized,
    mobile,
    official_hours_12_months,
    official_hours_24_months,
    account_access_eligible,
    last_synced_at,
    last_import_file_id
  )
  select
    person ->> 'ymhub_volunteer_id',
    person ->> 'display_name',
    nullif(person ->> 'primary_email_normalized', ''),
    nullif(person ->> 'mobile', ''),
    nullif(person ->> 'official_hours_12_months', '')::numeric,
    nullif(person ->> 'official_hours_24_months', '')::numeric,
    true,
    v_now,
    v_person_file_id
  from jsonb_array_elements(p_person_accounts) as incoming(person)
  on conflict (ymhub_volunteer_id) do update
  set
    display_name = excluded.display_name,
    primary_email_normalized = excluded.primary_email_normalized,
    mobile = excluded.mobile,
    official_hours_12_months = excluded.official_hours_12_months,
    official_hours_24_months = excluded.official_hours_24_months,
    account_access_eligible = true,
    last_synced_at = excluded.last_synced_at,
    last_import_file_id = excluded.last_import_file_id;

  select count(*)::integer
  into v_activity_updated
  from jsonb_array_elements(p_activities) as incoming(activity)
  join ymhub.activity_snapshots as existing
    on existing.ymhub_activity_id = incoming.activity ->> 'ymhub_activity_id';
  v_activity_inserted := jsonb_array_length(p_activities) - v_activity_updated;

  insert into ymhub.activity_snapshots (
    ymhub_activity_id,
    title,
    is_ad_hoc,
    starts_on,
    ends_on,
    source_status,
    published,
    last_import_file_id,
    last_imported_at
  )
  select
    activity ->> 'ymhub_activity_id',
    activity ->> 'title',
    (activity ->> 'is_ad_hoc')::boolean,
    (activity ->> 'starts_on')::date,
    (activity ->> 'ends_on')::date,
    activity ->> 'source_status',
    true,
    v_activity_file_id,
    v_now
  from jsonb_array_elements(p_activities) as incoming(activity)
  on conflict (ymhub_activity_id) do update
  set
    title = excluded.title,
    is_ad_hoc = excluded.is_ad_hoc,
    starts_on = excluded.starts_on,
    ends_on = excluded.ends_on,
    source_status = excluded.source_status,
    published = true,
    last_import_file_id = excluded.last_import_file_id,
    last_imported_at = excluded.last_imported_at;

  select count(*)::integer
  into v_shift_updated
  from jsonb_array_elements(p_shifts) as incoming(shift_row)
  join ymhub.shift_snapshots as existing
    on existing.ymhub_shift_id = incoming.shift_row ->> 'ymhub_shift_id';
  v_shift_inserted := jsonb_array_length(p_shifts) - v_shift_updated;

  insert into ymhub.shift_snapshots (
    ymhub_shift_id,
    ymhub_activity_id,
    job_position_name,
    shift_label,
    starts_at,
    ends_at,
    last_import_file_id,
    last_imported_at
  )
  select
    shift_row ->> 'ymhub_shift_id',
    shift_row ->> 'ymhub_activity_id',
    shift_row ->> 'job_position_name',
    null,
    (shift_row ->> 'starts_at')::timestamptz,
    (shift_row ->> 'ends_at')::timestamptz,
    v_shift_file_id,
    v_now
  from jsonb_array_elements(p_shifts) as incoming(shift_row)
  on conflict (ymhub_shift_id) do update
  set
    ymhub_activity_id = excluded.ymhub_activity_id,
    job_position_name = excluded.job_position_name,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    last_import_file_id = excluded.last_import_file_id,
    last_imported_at = excluded.last_imported_at;

  select count(*)::integer
  into v_assignment_updated
  from jsonb_array_elements(p_assignments) as incoming(assignment_row)
  join ymhub.assignment_snapshots as existing
    on existing.ymhub_assignment_id = incoming.assignment_row ->> 'ymhub_assignment_id';
  v_assignment_inserted := jsonb_array_length(p_assignments) - v_assignment_updated;

  insert into ymhub.assignment_snapshots (
    ymhub_assignment_id,
    ymhub_volunteer_id,
    volunteer_id,
    ymhub_activity_id,
    ymhub_shift_id,
    source_status,
    actual_duration,
    last_import_file_id,
    last_imported_at
  )
  select
    assignment_row ->> 'ymhub_assignment_id',
    assignment_row ->> 'ymhub_volunteer_id',
    volunteer.id,
    assignment_row ->> 'ymhub_activity_id',
    nullif(assignment_row ->> 'ymhub_shift_id', ''),
    assignment_row ->> 'source_status',
    nullif(assignment_row ->> 'actual_duration', '')::numeric,
    v_assignment_file_id,
    v_now
  from jsonb_array_elements(p_assignments) as incoming(assignment_row)
  left join core.volunteers as volunteer
    on volunteer.ymhub_volunteer_id = assignment_row ->> 'ymhub_volunteer_id'
  on conflict (ymhub_assignment_id) do update
  set
    ymhub_volunteer_id = excluded.ymhub_volunteer_id,
    volunteer_id = excluded.volunteer_id,
    ymhub_activity_id = excluded.ymhub_activity_id,
    ymhub_shift_id = excluded.ymhub_shift_id,
    source_status = excluded.source_status,
    actual_duration = excluded.actual_duration,
    last_import_file_id = excluded.last_import_file_id,
    last_imported_at = excluded.last_imported_at;

  update public.phaseone_event_timeslots as timeslot
  set ymhub_shift_id = source_shift.ymhub_shift_id
  from public.phaseone_events as event
  join ymhub.shift_snapshots as source_shift
    on source_shift.ymhub_activity_id = event.ymhub_activity_id
  where timeslot.event_id = event.id
    and timeslot.ymhub_shift_id is null
    and timeslot.starts_at = source_shift.starts_at
    and timeslot.ends_at is not distinct from source_shift.ends_at;

  update public.phaseone_roster as roster
  set
    volunteer_id = source_assignment.volunteer_id,
    ymhub_assignment_id = source_assignment.ymhub_assignment_id,
    source_assignment_status = source_assignment.source_status
  from ymhub.assignment_snapshots as source_assignment
  join core.volunteers as volunteer
    on volunteer.id = source_assignment.volunteer_id
  join public.phaseone_event_timeslots as timeslot
    on timeslot.ymhub_shift_id = source_assignment.ymhub_shift_id
  where roster.timeslot_id = timeslot.id
    and roster.ymhub_assignment_id is null
    and (
      roster.volunteer_id = volunteer.id
      or roster.volunteer_key = volunteer.ymhub_volunteer_id
      or (
        roster.email_normalized is not null
        and roster.email_normalized = volunteer.primary_email_normalized
      )
    );

  for v_issue in select value from jsonb_array_elements(coalesce(p_issues, '[]'::jsonb))
  loop
    v_issue_file_id := case v_issue ->> 'dataset'
      when 'person_accounts' then v_person_file_id
      when 'volunteer_initiatives' then v_activity_file_id
      when 'job_position_shifts' then v_shift_file_id
      when 'job_position_assignments' then v_assignment_file_id
      else null
    end;

    if v_issue_file_id is not null and coalesce(v_issue ->> 'severity', '') in ('warning', 'info') then
      insert into integration.ymhub_import_exceptions (
        import_file_id,
        row_number,
        code,
        message
      ) values (
        v_issue_file_id,
        nullif(v_issue ->> 'row', '')::integer,
        left(coalesce(v_issue ->> 'code', 'IMPORT_NOTE'), 100),
        left(coalesce(v_issue ->> 'message', 'Import note'), 1000)
      );
    end if;
  end loop;

  update integration.ymhub_import_files
  set
    status = 'committed',
    inserted_count = case dataset
      when 'person_accounts' then v_person_inserted
      when 'volunteer_initiatives' then v_activity_inserted
      when 'job_position_shifts' then v_shift_inserted
      when 'job_position_assignments' then v_assignment_inserted
      else 0
    end,
    updated_count = case dataset
      when 'person_accounts' then v_person_updated
      when 'volunteer_initiatives' then v_activity_updated
      when 'job_position_shifts' then v_shift_updated
      when 'job_position_assignments' then v_assignment_updated
      else 0
    end
  where integration.ymhub_import_files.batch_id = v_batch_id;

  update integration.ymhub_import_batches
  set
    status = 'committed',
    committed_at = v_now
  where integration.ymhub_import_batches.id = v_batch_id;

  perform audit.write_event(
    'ymhub.batch_imported',
    'ymhub_import_batch',
    v_batch_id::text,
    jsonb_build_object(
      'period_start', p_period_start,
      'period_end', p_period_end,
      'person_accounts', jsonb_array_length(p_person_accounts),
      'activities', jsonb_array_length(p_activities),
      'shifts', jsonb_array_length(p_shifts),
      'assignments', jsonb_array_length(p_assignments)
    ),
    p_created_by,
    null
  );

  return jsonb_build_object(
    'batch_id', v_batch_id,
    'status', 'committed',
    'person_accounts', jsonb_build_object('inserted', v_person_inserted, 'updated', v_person_updated),
    'volunteer_initiatives', jsonb_build_object('inserted', v_activity_inserted, 'updated', v_activity_updated),
    'job_position_shifts', jsonb_build_object('inserted', v_shift_inserted, 'updated', v_shift_updated),
    'job_position_assignments', jsonb_build_object('inserted', v_assignment_inserted, 'updated', v_assignment_updated)
  );
end;
$$;

comment on function core.apply_ymhub_import_batch(date, date, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) is
  'Atomically records and applies one validated four-file YM Hub inbound batch. Raw CSV contents are not retained.';

revoke all on function core.apply_ymhub_import_batch(date, date, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  from public, anon, authenticated;
grant execute on function core.apply_ymhub_import_batch(date, date, uuid, text, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb)
  to service_role;

commit;
