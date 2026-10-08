-- Pending applications reserve places during intake, but confirming one of
-- those applications must only consume CONFIRMED capacity. Otherwise an
-- oversubscribed pending cohort cannot be reviewed at all.
-- The per-timeslot FOR UPDATE lock still serializes competing confirmations.
create or replace function core.review_keluarga_registration(
  p_registration_id uuid,
  p_decision text,
  p_note text,
  p_actor_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  registration_record public.keluarga_registrations%rowtype;
  volunteer_record core.volunteers%rowtype;
  timeslot_record public.phaseone_event_timeslots%rowtype;
  confirmed_count integer;
  normalized_decision public.keluarga_registration_status;
begin
  if p_decision not in ('confirmed','waitlisted','rejected') then
    raise exception 'Unsupported registration decision' using errcode = '22023';
  end if;
  normalized_decision := p_decision::public.keluarga_registration_status;

  if not exists (
    select 1
    from core.user_accounts accounts
    join core.user_roles roles on roles.user_id = accounts.id
    where accounts.id = p_actor_user_id
      and accounts.status = 'active'
      and roles.role in ('staff','volteam','admin')
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  select *
  into registration_record
  from public.keluarga_registrations
  where id = p_registration_id
  for update;

  if not found then
    raise exception 'Registration could not be found' using errcode = 'P0002';
  end if;

  if registration_record.status = 'confirmed'
     and normalized_decision <> 'confirmed' then
    raise exception 'A confirmed registration cannot be rejected or waitlisted'
      using errcode = 'P0001';
  end if;

  if normalized_decision = 'confirmed' then
    if registration_record.identity_state <> 'resolved'
       or registration_record.volunteer_id is null then
      raise exception 'Canonical volunteer identity must be resolved before confirmation'
        using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.keluarga_registration_shifts
      where registration_id = p_registration_id
    ) then
      raise exception 'Registration has no selected shifts' using errcode = 'P0001';
    end if;

    select *
    into volunteer_record
    from core.volunteers
    where id = registration_record.volunteer_id;

    if not found then
      raise exception 'Canonical volunteer identity is unavailable'
        using errcode = 'P0002';
    end if;

    for timeslot_record in
      select timeslot.*
      from public.phaseone_event_timeslots timeslot
      join public.keluarga_registration_shifts selection
        on selection.timeslot_id = timeslot.id
      where selection.registration_id = p_registration_id
      order by timeslot.starts_at,timeslot.sort_order,timeslot.id
      for update of timeslot
    loop
      if timeslot_record.event_id <> registration_record.event_id
         or timeslot_record.status <> 'scheduled' then
        raise exception 'A selected shift is no longer available'
          using errcode = 'P0001';
      end if;

      if coalesce(timeslot_record.ends_at,timeslot_record.starts_at) < now() then
        raise exception 'A selected shift has already ended; use attendance reconciliation instead'
          using errcode = 'P0001';
      end if;

      if timeslot_record.registration_capacity is not null then
        select count(distinct registration.id)::integer
        into confirmed_count
        from public.keluarga_registration_shifts selection
        join public.keluarga_registrations registration
          on registration.id = selection.registration_id
        where selection.timeslot_id = timeslot_record.id
          and registration.status = 'confirmed'
          and registration.id <> p_registration_id;

        if confirmed_count >= timeslot_record.registration_capacity then
          raise exception 'A selected shift is full; waitlist this registration instead'
            using errcode = 'P0001';
        end if;
      end if;
    end loop;
  end if;

  update public.keluarga_registrations
  set
    status = normalized_decision,
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    review_note = nullif(btrim(p_note),''),
    waitlisted_at = case when normalized_decision = 'waitlisted' then now() else null end,
    updated_at = now()
  where id = p_registration_id;

  if normalized_decision = 'confirmed' then
    for timeslot_record in
      select timeslot.*
      from public.phaseone_event_timeslots timeslot
      join public.keluarga_registration_shifts selection
        on selection.timeslot_id = timeslot.id
      where selection.registration_id = p_registration_id
      order by timeslot.starts_at,timeslot.sort_order
    loop
      insert into public.phaseone_roster(
        event_id,
        timeslot_id,
        volunteer_key,
        volunteer_name,
        email,
        mobile,
        uploaded_by,
        volunteer_id,
        entry_method,
        registration_id,
        source_assignment_status
      )
      values (
        registration_record.event_id,
        timeslot_record.id,
        volunteer_record.volunteer_code,
        coalesce(nullif(btrim(volunteer_record.display_name),''),volunteer_record.volunteer_code),
        volunteer_record.primary_email_normalized,
        volunteer_record.mobile,
        p_actor_user_id,
        volunteer_record.id,
        'keluarga_registration',
        p_registration_id,
        'confirmed'
      )
      on conflict do nothing;

      update public.phaseone_roster
      set
        volunteer_id = volunteer_record.id,
        registration_id = p_registration_id,
        source_assignment_status = 'confirmed',
        entry_method = case when entry_method = 'walk_in' then entry_method else 'keluarga_registration' end
      where event_id = registration_record.event_id
        and timeslot_id = timeslot_record.id
        and (
          registration_id = p_registration_id
          or volunteer_id = volunteer_record.id
          or roster_match_key = 'id:' || lower(volunteer_record.volunteer_code)
        );
    end loop;
  end if;

  return normalized_decision::text;
end;
$$;
