create type public.keluarga_registration_status as enum (
  'pending',
  'confirmed',
  'waitlisted',
  'rejected',
  'cancelled'
);

alter table public.phaseone_event_timeslots
  add column registration_capacity integer;

alter table public.phaseone_event_timeslots
  add constraint phaseone_event_timeslots_registration_capacity_check
  check (
    registration_capacity is null
    or registration_capacity between 1 and 10000
  );

comment on column public.phaseone_event_timeslots.registration_capacity is
  'Maximum confirmed KELUARGA registrations for this shift. NULL means no configured limit.';

grant select (registration_capacity)
  on public.phaseone_event_timeslots
  to anon, authenticated;

create table public.keluarga_registrations (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete restrict,
  event_id uuid not null references public.phaseone_events(id) on delete restrict,
  status public.keluarga_registration_status not null default 'pending',
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (review_note is null or char_length(btrim(review_note)) between 1 and 1000),
  waitlisted_at timestamptz,
  cancelled_at timestamptz,
  ymhub_registration_id text check (
    ymhub_registration_id is null
    or char_length(btrim(ymhub_registration_id)) between 1 and 128
  ),
  handoff_status text not null default 'not_sent' check (
    handoff_status in ('not_sent', 'pending', 'synced', 'failed')
  ),
  handoff_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (volunteer_id, event_id),
  constraint keluarga_registrations_review_consistent check (
    (status = 'pending' and reviewed_at is null)
    or (status <> 'pending' and reviewed_at is not null)
  )
);

create index keluarga_registrations_event_status_idx
  on public.keluarga_registrations(event_id, status, submitted_at);
create index keluarga_registrations_volunteer_idx
  on public.keluarga_registrations(volunteer_id, submitted_at desc);

create table public.keluarga_registration_shifts (
  registration_id uuid not null
    references public.keluarga_registrations(id) on delete cascade,
  timeslot_id uuid not null
    references public.phaseone_event_timeslots(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (registration_id, timeslot_id)
);

create index keluarga_registration_shifts_timeslot_idx
  on public.keluarga_registration_shifts(timeslot_id, registration_id);

create table public.keluarga_registration_status_history (
  id bigint generated always as identity primary key,
  registration_id uuid not null
    references public.keluarga_registrations(id) on delete cascade,
  status public.keluarga_registration_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(btrim(note)) <= 1000),
  changed_at timestamptz not null default now()
);

create index keluarga_registration_status_history_registration_idx
  on public.keluarga_registration_status_history(registration_id, changed_at desc);

create table public.keluarga_notifications (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete cascade,
  registration_id uuid references public.keluarga_registrations(id) on delete cascade,
  event_id uuid references public.phaseone_events(id) on delete set null,
  kind text not null check (kind in ('registration_submitted', 'registration_status')),
  title text not null check (char_length(btrim(title)) between 1 and 160),
  message text not null check (char_length(btrim(message)) between 1 and 1000),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index keluarga_notifications_volunteer_time_idx
  on public.keluarga_notifications(volunteer_id, created_at desc);

alter table public.phaseone_roster
  add column registration_id uuid
    references public.keluarga_registrations(id) on delete set null;

alter table public.phaseone_roster
  drop constraint if exists phaseone_roster_entry_method_check;
alter table public.phaseone_roster
  add constraint phaseone_roster_entry_method_check
  check (entry_method in ('roster_import', 'walk_in', 'keluarga_registration'));

create unique index phaseone_roster_registration_timeslot_uidx
  on public.phaseone_roster(registration_id, timeslot_id)
  where registration_id is not null;

create or replace function public.phaseone_replace_event_timeslots(
  p_event_id uuid,
  p_timeslots jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_timeslots) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Timeslots must be supplied as a JSON array.';
  end if;
  if jsonb_array_length(p_timeslots) > 100 then
    raise exception using errcode = '22023', message = 'A programme cannot contain more than 100 shifts.';
  end if;
  if not exists (
    select 1 from public.phaseone_events where id = p_event_id for update
  ) then
    raise exception using errcode = 'P0002', message = 'Programme could not be found.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_timeslots) as incoming(id uuid)
    join public.phaseone_event_timeslots existing on existing.id = incoming.id
    where incoming.id is not null and existing.event_id <> p_event_id
  ) then
    raise exception using errcode = '23503', message = 'A shift does not belong to this programme.';
  end if;

  delete from public.phaseone_event_timeslots existing
  where existing.event_id = p_event_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_timeslots) as incoming(id uuid)
      where incoming.id = existing.id
    );

  insert into public.phaseone_event_timeslots (
    id,
    event_id,
    label,
    starts_at,
    ends_at,
    status,
    sort_order,
    registration_capacity
  )
  select
    coalesce(incoming.id, gen_random_uuid()),
    p_event_id,
    nullif(trim(incoming.label), ''),
    incoming.starts_at,
    incoming.ends_at,
    coalesce(incoming.status, 'scheduled'),
    coalesce(incoming.sort_order, 0),
    incoming.registration_capacity
  from jsonb_to_recordset(p_timeslots) as incoming(
    id uuid,
    label text,
    starts_at timestamptz,
    ends_at timestamptz,
    status text,
    sort_order integer,
    registration_capacity integer
  )
  on conflict (id) do update
  set
    label = excluded.label,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    sort_order = excluded.sort_order,
    registration_capacity = excluded.registration_capacity
  where public.phaseone_event_timeslots.event_id = p_event_id;
end;
$$;

revoke all on function public.phaseone_replace_event_timeslots(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.phaseone_replace_event_timeslots(uuid, jsonb)
  to service_role;

create or replace function core.ensure_current_keluarga_volunteer()
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, auth, audit
as $$
declare
  current_user_id uuid := auth.uid();
  current_status core.account_status;
  verified_email text;
  account_name text;
  existing_volunteer_id uuid;
  candidate_id uuid;
  candidate_count integer;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select status, display_name
  into current_status, account_name
  from core.user_accounts
  where id = current_user_id;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    return 'account_inactive';
  end if;

  select lower(btrim(email))
  into verified_email
  from auth.users
  where id = current_user_id
    and email is not null
    and coalesce(email_confirmed_at, confirmed_at) is not null;

  if verified_email is null then
    return 'email_unverified';
  end if;

  select id
  into existing_volunteer_id
  from core.volunteers
  where auth_user_id = current_user_id
  limit 1;

  if existing_volunteer_id is not null then
    update core.volunteers
    set primary_email_normalized = verified_email
    where id = existing_volunteer_id;

    update core.user_accounts
    set status = 'active'
    where id = current_user_id;

    update public.phaseone_roster
    set volunteer_id = existing_volunteer_id
    where volunteer_id is null
      and email_normalized = verified_email;

    return 'already_linked';
  end if;

  select count(*)::integer
  into candidate_count
  from core.volunteers
  where primary_email_normalized = verified_email
    and auth_user_id is null
    and account_access_eligible;

  if candidate_count = 1 then
    select id
    into candidate_id
    from core.volunteers
    where primary_email_normalized = verified_email
      and auth_user_id is null
      and account_access_eligible
    limit 1;
    update core.volunteers
    set auth_user_id = current_user_id
    where id = candidate_id
      and auth_user_id is null;

    if found then
      update core.user_accounts
      set
        status = 'active',
        display_name = coalesce(
          (
            select nullif(btrim(display_name), '')
            from core.volunteers
            where id = candidate_id
          ),
          display_name
        )
      where id = current_user_id;

      update public.phaseone_roster
      set volunteer_id = candidate_id
      where volunteer_id is null
        and email_normalized = verified_email;

      return 'linked_existing';
    end if;
  end if;

  if candidate_count > 1 then
    insert into core.account_link_cases(auth_user_id, status, reason_code)
    select current_user_id, 'needs_review', 'ambiguous_verified_email'
    where not exists (
      select 1
      from core.account_link_cases
      where auth_user_id = current_user_id
        and status in ('pending', 'needs_review')
    );

    return 'needs_review';
  end if;

  insert into core.volunteers(
    auth_user_id,
    display_name,
    primary_email_normalized
  )
  values (
    current_user_id,
    nullif(btrim(account_name), ''),
    verified_email
  )
  returning id into existing_volunteer_id;

  update core.user_accounts
  set status = 'active'
  where id = current_user_id;

  update public.phaseone_roster
  set volunteer_id = existing_volunteer_id
  where volunteer_id is null
    and email_normalized = verified_email;

  return 'created';
end;
$$;

comment on function core.ensure_current_keluarga_volunteer() is
  'Ensures a verified authenticated account has one native KELUARGA volunteer identity. YM Hub linkage is not required.';

revoke all on function core.ensure_current_keluarga_volunteer()
  from public, anon, authenticated;
grant execute on function core.ensure_current_keluarga_volunteer()
  to authenticated, service_role;

create or replace function public.keluarga_record_registration_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
declare
  event_title text;
  notification_title text;
  notification_message text;
  notification_kind text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select title into event_title
  from public.phaseone_events
  where id = new.event_id;

  insert into public.keluarga_registration_status_history(
    registration_id,
    status,
    changed_by,
    note
  )
  values (
    new.id,
    new.status,
    coalesce(new.reviewed_by, auth.uid()),
    new.review_note
  );

  if new.status = 'pending' then
    notification_kind := 'registration_submitted';
    notification_title := 'Registration received';
    notification_message := 'Your registration for ' || coalesce(event_title, 'this programme') || ' has been submitted for review.';
  elsif new.status = 'confirmed' then
    notification_kind := 'registration_status';
    notification_title := 'Registration confirmed';
    notification_message := 'You are confirmed for ' || coalesce(event_title, 'this programme') || '. Your Event Guide will be available when published.';
  elsif new.status = 'waitlisted' then
    notification_kind := 'registration_status';
    notification_title := 'Registration waitlisted';
    notification_message := 'Your registration for ' || coalesce(event_title, 'this programme') || ' is on the waitlist.';
  elsif new.status = 'rejected' then
    notification_kind := 'registration_status';
    notification_title := 'Registration update';
    notification_message := 'Your registration for ' || coalesce(event_title, 'this programme') || ' was not confirmed.';
  else
    notification_kind := 'registration_status';
    notification_title := 'Registration cancelled';
    notification_message := 'Your registration for ' || coalesce(event_title, 'this programme') || ' has been cancelled.';
  end if;

  insert into public.keluarga_notifications(
    volunteer_id,
    registration_id,
    event_id,
    kind,
    title,
    message
  )
  values (
    new.volunteer_id,
    new.id,
    new.event_id,
    notification_kind,
    notification_title,
    notification_message
  );

  return new;
end;
$$;

revoke all on function public.keluarga_record_registration_change()
  from public, anon, authenticated;

create trigger keluarga_registrations_record_change
after insert or update of status
on public.keluarga_registrations
for each row execute function public.keluarga_record_registration_change();

create or replace function core.submit_keluarga_registration(
  p_event_id uuid,
  p_timeslot_ids uuid[],
  p_display_name text,
  p_mobile text default null
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
  verified_email text;
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

  if p_display_name is null
     or char_length(btrim(p_display_name)) < 1
     or char_length(btrim(p_display_name)) > 120 then
    raise exception 'Enter your full name' using errcode = '22023';
  end if;

  if p_mobile is not null and char_length(btrim(p_mobile)) > 40 then
    raise exception 'Mobile number is too long' using errcode = '22023';
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

  select lower(btrim(email))
  into verified_email
  from auth.users
  where id = current_user_id;

  select *
  into volunteer_record
  from core.volunteers
  where auth_user_id = current_user_id
  for update;

  update core.volunteers
  set
    display_name = btrim(p_display_name),
    primary_email_normalized = verified_email,
    mobile = nullif(btrim(p_mobile), '')
  where id = volunteer_record.id;

  update core.user_accounts
  set
    status = 'active',
    display_name = btrim(p_display_name)
  where id = current_user_id;

  select *
  into existing_registration
  from public.keluarga_registrations
  where volunteer_id = volunteer_record.id
    and event_id = p_event_id
  for update;

  if found then
    if existing_registration.status <> 'pending' then
      raise exception 'This registration has already been reviewed'
        using errcode = 'P0001';
    end if;

    v_registration_id := existing_registration.id;

    update public.keluarga_registrations
    set
      submitted_at = now(),
      updated_at = now()
    where id = v_registration_id;

    delete from public.keluarga_registration_shifts as selected_shift
    where selected_shift.registration_id = v_registration_id;
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

revoke all on function core.submit_keluarga_registration(uuid, uuid[], text, text)
  from public, anon, authenticated;
grant execute on function core.submit_keluarga_registration(uuid, uuid[], text, text)
  to authenticated, service_role;

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
  if p_decision not in ('confirmed', 'waitlisted', 'rejected') then
    raise exception 'Unsupported registration decision' using errcode = '22023';
  end if;
  normalized_decision := p_decision::public.keluarga_registration_status;

  if not exists (
    select 1
    from core.user_accounts accounts
    join core.user_roles roles on roles.user_id = accounts.id
    where accounts.id = p_actor_user_id
      and accounts.status = 'active'
      and roles.role in ('attendance_manager', 'admin')
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

  select *
  into volunteer_record
  from core.volunteers
  where id = registration_record.volunteer_id;

  if normalized_decision = 'confirmed' then
    if not exists (
      select 1
      from public.keluarga_registration_shifts
      where registration_id = p_registration_id
    ) then
      raise exception 'Registration has no selected shifts' using errcode = 'P0001';
    end if;

  end if;

  if normalized_decision = 'confirmed' then
    for timeslot_record in
      select timeslot.*
      from public.phaseone_event_timeslots timeslot
      join public.keluarga_registration_shifts selection
        on selection.timeslot_id = timeslot.id
      where selection.registration_id = p_registration_id
      order by timeslot.starts_at, timeslot.sort_order
      for update of timeslot
    loop
      if timeslot_record.event_id <> registration_record.event_id
         or timeslot_record.status <> 'scheduled' then
        raise exception 'A selected shift is no longer available' using errcode = 'P0001';
      end if;

      if timeslot_record.registration_capacity is not null then
        select count(*)::integer
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
    review_note = nullif(btrim(p_note), ''),
    waitlisted_at = case
      when normalized_decision = 'waitlisted' then now()
      else null
    end,
    updated_at = now()
  where id = p_registration_id;

  if normalized_decision = 'confirmed' then
    for timeslot_record in
      select timeslot.*
      from public.phaseone_event_timeslots timeslot
      join public.keluarga_registration_shifts selection
        on selection.timeslot_id = timeslot.id
      where selection.registration_id = p_registration_id
      order by timeslot.starts_at, timeslot.sort_order
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
        coalesce(nullif(btrim(volunteer_record.display_name), ''), volunteer_record.volunteer_code),
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
        entry_method = case
          when entry_method = 'walk_in' then entry_method
          else 'keluarga_registration'
        end
      where event_id = registration_record.event_id
        and timeslot_id = timeslot_record.id
        and (
          registration_id = p_registration_id
          or roster_match_key = 'id:' || lower(volunteer_record.volunteer_code)
        );
    end loop;
  end if;

  return normalized_decision::text;
end;
$$;

revoke all on function core.review_keluarga_registration(uuid, text, text, uuid)
  from public, anon, authenticated;
grant execute on function core.review_keluarga_registration(uuid, text, text, uuid)
  to service_role;

alter table public.keluarga_registrations enable row level security;
alter table public.keluarga_registrations force row level security;
alter table public.keluarga_registration_shifts enable row level security;
alter table public.keluarga_registration_shifts force row level security;
alter table public.keluarga_registration_status_history enable row level security;
alter table public.keluarga_registration_status_history force row level security;
alter table public.keluarga_notifications enable row level security;
alter table public.keluarga_notifications force row level security;

create policy keluarga_registrations_select_self
on public.keluarga_registrations
for select to authenticated
using (volunteer_id = (select core.current_volunteer_id()));

create policy keluarga_registration_shifts_select_self
on public.keluarga_registration_shifts
for select to authenticated
using (
  exists (
    select 1
    from public.keluarga_registrations registration
    where registration.id = registration_id
      and registration.volunteer_id = (select core.current_volunteer_id())
  )
);

create policy keluarga_registration_status_history_select_self
on public.keluarga_registration_status_history
for select to authenticated
using (
  exists (
    select 1
    from public.keluarga_registrations registration
    where registration.id = registration_id
      and registration.volunteer_id = (select core.current_volunteer_id())
  )
);

create policy keluarga_notifications_select_self
on public.keluarga_notifications
for select to authenticated
using (volunteer_id = (select core.current_volunteer_id()));

revoke all on public.keluarga_registrations from public, anon, authenticated;
revoke all on public.keluarga_registration_shifts from public, anon, authenticated;
revoke all on public.keluarga_registration_status_history from public, anon, authenticated;
revoke all on public.keluarga_notifications from public, anon, authenticated;

grant select on public.keluarga_registrations to authenticated;
grant select on public.keluarga_registration_shifts to authenticated;
grant select on public.keluarga_registration_status_history to authenticated;
grant select on public.keluarga_notifications to authenticated;

grant all on public.keluarga_registrations to service_role;
grant all on public.keluarga_registration_shifts to service_role;
grant all on public.keluarga_registration_status_history to service_role;
grant all on public.keluarga_notifications to service_role;
grant usage, select on sequence public.keluarga_registration_status_history_id_seq to service_role;

comment on table public.keluarga_registrations is
  'KELUARGA-owned volunteer registration lifecycle for a canonical programme/event.';
comment on table public.keluarga_registration_shifts is
  'Selected programme shifts attached to a KELUARGA registration.';
comment on table public.keluarga_registration_status_history is
  'Append-only registration status history for audit and volunteer support.';
comment on table public.keluarga_notifications is
  'In-app volunteer notifications generated from KELUARGA registration lifecycle changes.';
comment on column public.phaseone_roster.registration_id is
  'Stable KELUARGA registration that generated this event-operations roster assignment. Walk-ins may be NULL.';
