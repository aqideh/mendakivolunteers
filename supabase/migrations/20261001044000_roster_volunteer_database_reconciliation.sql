begin;

alter table public.phaseone_roster
  add column volunteer_link_status text,
  add column volunteer_link_note text;

alter table public.phaseone_roster
  add constraint phaseone_roster_volunteer_link_status_check
  check (
    volunteer_link_status is null
    or volunteer_link_status in ('matched_existing', 'created_new', 'needs_review')
  ),
  add constraint phaseone_roster_volunteer_link_note_check
  check (
    volunteer_link_note is null
    or char_length(volunteer_link_note) <= 500
  );

comment on column public.phaseone_roster.volunteer_link_status is
  'Database reconciliation status for staff roster imports: matched_existing, created_new, or needs_review.';
comment on column public.phaseone_roster.volunteer_link_note is
  'Staff-facing explanation for roster-to-volunteer database reconciliation.';

create index phaseone_roster_event_link_status_idx
  on public.phaseone_roster(event_id, volunteer_link_status)
  where volunteer_link_status is not null;

alter table public.phaseone_roster_imports
  add column review_volunteer_count integer not null default 0;

alter table public.phaseone_roster_imports
  add constraint phaseone_roster_imports_review_count_check
  check (review_volunteer_count >= 0);

comment on column public.phaseone_roster_imports.review_volunteer_count is
  'Count of distinct imported volunteer identities that require manual database-link review.';

create or replace function core.resolve_roster_import_volunteer(
  p_existing_volunteer_id uuid,
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_normalized_key text := upper(nullif(btrim(coalesce(p_volunteer_key, '')), ''));
  v_normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_normalized_mobile text := public.phaseone_canonical_mobile(p_mobile);
  v_key_volunteer_id uuid;
  v_contact_ids uuid[];
  v_contact_count integer := 0;
  v_candidate_id uuid;
  v_volunteer_code text;
  v_created boolean := false;
  v_has_profile_contact boolean := false;
begin
  if p_volunteer_name is null or char_length(btrim(p_volunteer_name)) < 1 then
    raise exception 'Volunteer name is required' using errcode = '22023';
  end if;
  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120' using errcode = '22023';
  end if;

  if v_normalized_email is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('roster-email:' || v_normalized_email, 0)
    );
  end if;
  if v_normalized_mobile is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('roster-mobile:' || v_normalized_mobile, 0)
    );
  end if;

  if v_normalized_key like 'KEL%' and v_normalized_key !~ '^KEL[0-9]{5}$' then
    return jsonb_build_object(
      'status', 'needs_review',
      'volunteer_id', p_existing_volunteer_id,
      'volunteer_code', null,
      'note', 'The supplied KELUARGA Volunteer ID is not in KEL00001 format.'
    );
  end if;

  if v_normalized_key ~ '^KEL[0-9]{5}$' then
    select volunteer.id
    into v_key_volunteer_id
    from core.volunteers volunteer
    where volunteer.volunteer_code = v_normalized_key;

    if v_key_volunteer_id is null then
      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', p_existing_volunteer_id,
        'volunteer_code', null,
        'note', 'The supplied KELUARGA Volunteer ID does not exist in the volunteer database.'
      );
    end if;
  end if;

  select array_agg(distinct volunteer.id order by volunteer.id)
  into v_contact_ids
  from core.volunteers volunteer
  where (v_normalized_email is not null and volunteer.primary_email_normalized = v_normalized_email)
     or (
       v_normalized_mobile is not null
       and public.phaseone_canonical_mobile(volunteer.mobile) = v_normalized_mobile
     );

  v_contact_count := coalesce(array_length(v_contact_ids, 1), 0);

  if p_existing_volunteer_id is not null then
    if not exists (
      select 1 from core.volunteers where id = p_existing_volunteer_id
    ) then
      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', null,
        'volunteer_code', null,
        'note', 'The roster row references a volunteer record that no longer exists.'
      );
    end if;

    if v_key_volunteer_id is not null
       and v_key_volunteer_id <> p_existing_volunteer_id then
      select volunteer_code into v_volunteer_code
      from core.volunteers where id = p_existing_volunteer_id;

      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', p_existing_volunteer_id,
        'volunteer_code', v_volunteer_code,
        'note', 'The supplied KELUARGA Volunteer ID conflicts with the volunteer already linked to this roster row.'
      );
    end if;

    if v_contact_count > 1
       or (
         v_contact_count = 1
         and v_contact_ids[1] <> p_existing_volunteer_id
       ) then
      select volunteer_code into v_volunteer_code
      from core.volunteers where id = p_existing_volunteer_id;

      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', p_existing_volunteer_id,
        'volunteer_code', v_volunteer_code,
        'note', 'The supplied email or mobile number conflicts with the volunteer already linked to this roster row.'
      );
    end if;

    v_candidate_id := p_existing_volunteer_id;
  else
    if v_contact_count > 1 then
      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', null,
        'volunteer_code', null,
        'note', 'The supplied email or mobile number matches more than one existing KELUARGA volunteer.'
      );
    end if;

    if v_key_volunteer_id is not null
       and v_contact_count = 1
       and v_key_volunteer_id <> v_contact_ids[1] then
      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', null,
        'volunteer_code', null,
        'note', 'The supplied KELUARGA ID and contact details point to different volunteers.'
      );
    end if;

    v_candidate_id := coalesce(
      v_key_volunteer_id,
      case when v_contact_count = 1 then v_contact_ids[1] else null end
    );
  end if;

  if v_candidate_id is null then
    if v_normalized_email is null and v_normalized_mobile is null then
      return jsonb_build_object(
        'status', 'needs_review',
        'volunteer_id', null,
        'volunteer_code', null,
        'note', 'No email or mobile number was supplied, so a new volunteer record was not created.'
      );
    end if;

    insert into core.volunteers(
      display_name,
      primary_email_normalized,
      mobile,
      age
    )
    values (
      btrim(p_volunteer_name),
      v_normalized_email,
      nullif(btrim(p_mobile), ''),
      p_age
    )
    returning id, volunteer_code
    into v_candidate_id, v_volunteer_code;

    v_created := true;
  else
    update core.volunteers
    set
      display_name = coalesce(nullif(btrim(display_name), ''), btrim(p_volunteer_name)),
      primary_email_normalized = coalesce(primary_email_normalized, v_normalized_email),
      mobile = coalesce(mobile, nullif(btrim(p_mobile), '')),
      age = coalesce(age, p_age),
      updated_at = now()
    where id = v_candidate_id;

    select volunteer_code
    into v_volunteer_code
    from core.volunteers
    where id = v_candidate_id;
  end if;

  select
    coalesce(
      nullif(btrim(primary_email_normalized), ''),
      nullif(btrim(mobile), '')
    ) is not null
  into v_has_profile_contact
  from core.volunteers
  where id = v_candidate_id;

  if v_has_profile_contact then
    perform core.ensure_maklom_profile_extension(
      v_candidate_id,
      case
        when v_created then 'keluarga_roster_import'
        else 'keluarga_roster_match'
      end
    );
  end if;

  return jsonb_build_object(
    'status', case when v_created then 'created_new' else 'matched_existing' end,
    'volunteer_id', v_candidate_id,
    'volunteer_code', v_volunteer_code,
    'note', case
      when v_created then 'No existing volunteer matched. A new KELUARGA volunteer record and ID were created.'
      else 'Matched to an existing KELUARGA volunteer.'
    end
  );
end;
$$;

revoke all on function core.resolve_roster_import_volunteer(uuid, text, text, text, text, smallint)
  from public, anon, authenticated, service_role;

create or replace function public.phaseone_reconcile_roster_rows(
  p_event_id uuid,
  p_rows jsonb,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_scope text;
  v_row record;
  v_roster_id uuid;
  v_existing_volunteer_id uuid;
  v_existing_link_status text;
  v_resolved jsonb;
  v_status text;
  v_note text;
  v_volunteer_id uuid;
  v_volunteer_code text;
  v_linked_ids uuid[] := array[]::uuid[];
  v_created_ids uuid[] := array[]::uuid[];
  v_review_keys text[] := array[]::text[];
  v_review_key text;
  v_processed integer := 0;
begin
  if not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role in ('staff', 'volteam', 'admin')
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  select event.operations_scope
  into v_event_scope
  from public.phaseone_events event
  where event.id = p_event_id;

  if v_event_scope is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_event_scope = 'manual_isolated' then
    raise exception 'This event is isolated from the shared volunteer database'
      using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_rows) <> 'array' then
    raise exception 'Roster payload must be a JSON array' using errcode = '22023';
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
    v_roster_id := public.phaseone_find_roster_match(
      p_event_id,
      v_row.timeslot_id,
      v_row.volunteer_key,
      v_row.email,
      v_row.mobile,
      v_row.volunteer_name
    );

    if v_roster_id is null then
      raise exception 'Imported roster row could not be reconciled after import'
        using errcode = 'P0001';
    end if;

    select roster.volunteer_id, roster.volunteer_link_status
    into v_existing_volunteer_id, v_existing_link_status
    from public.phaseone_roster roster
    where roster.id = v_roster_id
    for update;

    v_resolved := core.resolve_roster_import_volunteer(
      v_existing_volunteer_id,
      v_row.volunteer_key,
      v_row.volunteer_name,
      v_row.email,
      v_row.mobile,
      v_row.age
    );

    v_status := v_resolved ->> 'status';
    v_note := v_resolved ->> 'note';
    v_volunteer_id := nullif(v_resolved ->> 'volunteer_id', '')::uuid;
    v_volunteer_code := v_resolved ->> 'volunteer_code';

    if v_status = 'matched_existing'
       and (
         v_existing_link_status = 'created_new'
         or (
           v_volunteer_id is not null
           and v_volunteer_id = any(v_created_ids)
         )
       ) then
      v_status := 'created_new';
      v_note := 'No existing volunteer matched when this roster was reconciled. A new KELUARGA volunteer record and ID were created.';
    end if;

    if v_status in ('matched_existing', 'created_new')
       and v_volunteer_id is not null then
      if not (v_volunteer_id = any(v_linked_ids)) then
        v_linked_ids := array_append(v_linked_ids, v_volunteer_id);
      end if;
      if v_status = 'created_new'
         and not (v_volunteer_id = any(v_created_ids)) then
        v_created_ids := array_append(v_created_ids, v_volunteer_id);
      end if;
    elsif v_status = 'needs_review' then
      v_review_key := coalesce(
        case
          when nullif(btrim(v_row.volunteer_key), '') is not null
            then 'id:' || lower(btrim(v_row.volunteer_key))
        end,
        case
          when nullif(btrim(v_row.email), '') is not null
            then 'email:' || lower(btrim(v_row.email))
        end,
        case
          when public.phaseone_canonical_mobile(v_row.mobile) is not null
            then 'mobile:' || public.phaseone_canonical_mobile(v_row.mobile)
        end,
        'name:' || lower(btrim(regexp_replace(v_row.volunteer_name, '\s+', ' ', 'g')))
      );
      if not (v_review_key = any(v_review_keys)) then
        v_review_keys := array_append(v_review_keys, v_review_key);
      end if;
    else
      raise exception 'Unsupported volunteer reconciliation status: %', v_status
        using errcode = 'P0001';
    end if;

    update public.phaseone_roster
    set
      volunteer_id = coalesce(v_volunteer_id, volunteer_id),
      volunteer_key = coalesce(nullif(btrim(v_volunteer_code), ''), volunteer_key),
      volunteer_link_status = v_status,
      volunteer_link_note = nullif(left(v_note, 500), '')
    where id = v_roster_id;

    v_processed := v_processed + 1;
  end loop;

  return jsonb_build_object(
    'processed_row_count', v_processed,
    'linked_volunteer_count', coalesce(array_length(v_linked_ids, 1), 0),
    'matched_existing_volunteer_count',
      coalesce(array_length(v_linked_ids, 1), 0)
      - coalesce(array_length(v_created_ids, 1), 0),
    'created_volunteer_count', coalesce(array_length(v_created_ids, 1), 0),
    'review_volunteer_count', coalesce(array_length(v_review_keys, 1), 0)
  );
end;
$$;

revoke all on function public.phaseone_reconcile_roster_rows(uuid, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_reconcile_roster_rows(uuid, jsonb, uuid)
  to service_role;

create or replace function public.phaseone_apply_database_roster_import(
  p_event_id uuid,
  p_mode text,
  p_file_name text,
  p_rows jsonb,
  p_uploaded_by uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_scope text;
  v_base_result jsonb;
  v_reconcile_result jsonb;
  v_import_id uuid;
begin
  select event.operations_scope
  into v_event_scope
  from public.phaseone_events event
  where event.id = p_event_id
  for update;

  if v_event_scope is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if v_event_scope = 'manual_isolated' then
    raise exception 'This event is isolated from the shared volunteer database'
      using errcode = 'P0001';
  end if;

  v_base_result := public.phaseone_apply_roster_import(
    p_event_id,
    p_mode,
    p_file_name,
    p_rows,
    p_uploaded_by
  );

  v_reconcile_result := public.phaseone_reconcile_roster_rows(
    p_event_id,
    p_rows,
    p_uploaded_by
  );

  v_import_id := nullif(v_base_result ->> 'import_id', '')::uuid;

  update public.phaseone_roster_imports
  set
    integration_mode = 'volunteer_database',
    linked_volunteer_count = coalesce(
      (v_reconcile_result ->> 'linked_volunteer_count')::integer,
      0
    ),
    created_volunteer_count = coalesce(
      (v_reconcile_result ->> 'created_volunteer_count')::integer,
      0
    ),
    review_volunteer_count = coalesce(
      (v_reconcile_result ->> 'review_volunteer_count')::integer,
      0
    )
  where id = v_import_id;

  return v_base_result || v_reconcile_result || jsonb_build_object(
    'integration_mode', 'volunteer_database'
  );
end;
$$;

revoke all on function public.phaseone_apply_database_roster_import(uuid, text, text, jsonb, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_database_roster_import(uuid, text, text, jsonb, uuid)
  to service_role;

commit;
