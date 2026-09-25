drop function if exists core.submit_keluarga_registration(uuid, uuid[], text, text);

create or replace function core.submit_keluarga_registration(
  p_event_id uuid,
  p_timeslot_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, public, auth
as $$
declare
  current_user_id uuid := auth.uid();
  ensure_result text;
  volunteer_record core.volunteers%rowtype;
  event_record public.phaseone_events%rowtype;
  existing_registration public.keluarga_registrations%rowtype;
  v_registration_id uuid;
  selected_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  ensure_result := core.ensure_current_keluarga_volunteer();
  if ensure_result in ('account_inactive', 'email_unverified', 'needs_review') then
    raise exception 'KELUARGA volunteer profile is not ready for registration'
      using errcode = '42501';
  end if;

  if p_timeslot_ids is null
     or cardinality(p_timeslot_ids) < 1
     or cardinality(p_timeslot_ids) > 100 then
    raise exception 'Select at least one shift' using errcode = '22023';
  end if;

  select count(distinct item)
  into selected_count
  from unnest(p_timeslot_ids) as item;

  if selected_count <> cardinality(p_timeslot_ids) then
    raise exception 'Duplicate shifts were selected' using errcode = '22023';
  end if;

  select *
  into event_record
  from public.phaseone_events
  where id = p_event_id
  for share;

  if not found or not event_record.is_opportunity_published then
    raise exception 'This opportunity is not open for registration' using errcode = 'P0002';
  end if;

  if event_record.registration_deadline is not null
     and event_record.registration_deadline < now() then
    raise exception 'The registration deadline has passed' using errcode = 'P0001';
  end if;

  select count(*)::integer
  into selected_count
  from public.phaseone_event_timeslots
  where event_id = p_event_id
    and id = any(p_timeslot_ids)
    and status = 'scheduled';

  if selected_count <> cardinality(p_timeslot_ids) then
    raise exception 'One or more selected shifts are unavailable' using errcode = '22023';
  end if;

  select *
  into volunteer_record
  from core.volunteers
  where auth_user_id = current_user_id
  for update;

  if not found then
    raise exception 'KELUARGA volunteer profile is unavailable' using errcode = '42501';
  end if;

  select *
  into existing_registration
  from public.keluarga_registrations
  where volunteer_id = volunteer_record.id
    and event_id = p_event_id
  for update;

  if found then
    if existing_registration.status not in ('pending', 'withdrawn', 'cancelled') then
      raise exception 'This registration has already been reviewed'
        using errcode = 'P0001';
    end if;

    v_registration_id := existing_registration.id;

    update public.keluarga_registrations
    set
      status = 'pending',
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      waitlisted_at = null,
      cancelled_at = null,
      handoff_status = 'not_sent',
      updated_at = now()
    where id = v_registration_id;

    delete from public.keluarga_registration_shifts
    where registration_id = v_registration_id;
  else
    insert into public.keluarga_registrations(
      volunteer_id,
      event_id
    )
    values (
      volunteer_record.id,
      p_event_id
    )
    returning id into v_registration_id;
  end if;

  insert into public.keluarga_registration_shifts(registration_id, timeslot_id)
  select v_registration_id, item
  from unnest(p_timeslot_ids) as item;

  return v_registration_id;
end;
$$;

revoke all on function core.submit_keluarga_registration(uuid, uuid[])
  from public, anon, authenticated;
grant execute on function core.submit_keluarga_registration(uuid, uuid[])
  to authenticated, service_role;

comment on function core.submit_keluarga_registration(uuid, uuid[]) is
  'Registers the authenticated KELUARGA volunteer for selected shifts without editing volunteer profile fields.';
