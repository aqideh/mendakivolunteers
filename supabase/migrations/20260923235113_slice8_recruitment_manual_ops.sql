create type public.keluarga_recruitment_status as enum (
  'submitted',
  'reviewing',
  'accepted',
  'not_selected',
  'withdrawn'
);

alter table public.phaseone_events
  add column operations_scope text not null default 'canonical',
  add column credit_contribution_hours boolean not null default false;

alter table public.phaseone_events
  add constraint phaseone_events_operations_scope_check
  check (operations_scope in ('canonical', 'manual_isolated', 'manual_integrated')),
  add constraint phaseone_events_credit_scope_check
  check (not credit_contribution_hours or operations_scope = 'manual_integrated');

comment on column public.phaseone_events.operations_scope is
  'Operational data boundary: canonical for normal KELUARGA programmes, manual_isolated for event-only staff operations, manual_integrated for staff operations linked to the KELUARGA volunteer database.';
comment on column public.phaseone_events.credit_contribution_hours is
  'When true on a manual_integrated event, authorised staff may materialise app-owned KELUARGA contribution-hour credits from completed Event Operations attendance sessions. These are not YM Hub verified hours.';

alter table public.phaseone_roster_imports
  add column integration_mode text not null default 'event_only',
  add column linked_volunteer_count integer not null default 0,
  add column created_volunteer_count integer not null default 0;

alter table public.phaseone_roster_imports
  add constraint phaseone_roster_imports_integration_mode_check
  check (integration_mode in ('event_only', 'volunteer_database')),
  add constraint phaseone_roster_imports_linked_count_check
  check (linked_volunteer_count >= 0 and created_volunteer_count >= 0 and created_volunteer_count <= linked_volunteer_count);

create table public.keluarga_recruitment_applications (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete restrict,
  status public.keluarga_recruitment_status not null default 'submitted',
  interest_area text not null check (
    interest_area in ('general', 'mentor', 'coach', 'facilitator', 'specialist', 'not_sure')
  ),
  motivation text not null check (char_length(btrim(motivation)) between 10 and 2000),
  skills_experience text check (
    skills_experience is null or char_length(btrim(skills_experience)) between 1 and 3000
  ),
  availability_notes text check (
    availability_notes is null or char_length(btrim(availability_notes)) between 1 and 1500
  ),
  referral_source text check (
    referral_source is null or char_length(btrim(referral_source)) between 1 and 300
  ),
  submitted_at timestamptz not null default now(),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text check (
    review_note is null or char_length(btrim(review_note)) between 1 and 1500
  ),
  withdrawn_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index keluarga_recruitment_one_open_application_idx
  on public.keluarga_recruitment_applications(volunteer_id)
  where status in ('submitted', 'reviewing');

create index keluarga_recruitment_status_submitted_idx
  on public.keluarga_recruitment_applications(status, submitted_at);
create index keluarga_recruitment_volunteer_idx
  on public.keluarga_recruitment_applications(volunteer_id, submitted_at desc);
create index keluarga_recruitment_reviewed_by_idx
  on public.keluarga_recruitment_applications(reviewed_by)
  where reviewed_by is not null;

create table public.keluarga_recruitment_status_history (
  id bigint generated always as identity primary key,
  application_id uuid not null
    references public.keluarga_recruitment_applications(id) on delete cascade,
  status public.keluarga_recruitment_status not null,
  changed_by uuid references auth.users(id) on delete set null,
  note text check (note is null or char_length(btrim(note)) <= 1500),
  changed_at timestamptz not null default now()
);

create index keluarga_recruitment_history_application_idx
  on public.keluarga_recruitment_status_history(application_id, changed_at desc);
create index keluarga_recruitment_history_changed_by_idx
  on public.keluarga_recruitment_status_history(changed_by)
  where changed_by is not null;

create table public.keluarga_contribution_credits (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete restrict,
  event_id uuid not null references public.phaseone_events(id) on delete restrict,
  attendance_session_id uuid not null
    references public.phaseone_attendance_sessions(id) on delete restrict,
  credit_hours numeric(8,2) not null check (credit_hours >= 0 and credit_hours <= 24),
  status text not null default 'active' check (status in ('active', 'reversed')),
  source text not null default 'manual_event_operations'
    check (source = 'manual_event_operations'),
  credited_by uuid not null references auth.users(id) on delete restrict,
  credited_at timestamptz not null default now(),
  updated_by uuid not null references auth.users(id) on delete restrict,
  updated_at timestamptz not null default now(),
  unique (attendance_session_id)
);

create index keluarga_contribution_credits_volunteer_idx
  on public.keluarga_contribution_credits(volunteer_id, credited_at desc);
create index keluarga_contribution_credits_event_idx
  on public.keluarga_contribution_credits(event_id, status);

comment on table public.keluarga_contribution_credits is
  'App-owned KELUARGA contribution-hour credits from manual integrated Event Operations. They are deliberately separate from authoritative YM Hub verified attendance and verified hours.';

create or replace function public.keluarga_record_recruitment_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  insert into public.keluarga_recruitment_status_history(
    application_id,
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

  return new;
end;
$$;

revoke all on function public.keluarga_record_recruitment_change()
  from public, anon, authenticated;

create trigger keluarga_recruitment_record_change
after insert or update of status
on public.keluarga_recruitment_applications
for each row execute function public.keluarga_record_recruitment_change();

create or replace function core.submit_keluarga_recruitment_application(
  p_interest_area text,
  p_motivation text,
  p_skills_experience text default null,
  p_availability_notes text default null,
  p_referral_source text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, public, auth
as $$
declare
  ensure_result text;
  current_volunteer_id uuid;
  existing_application_id uuid;
  application_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  ensure_result := core.ensure_current_keluarga_volunteer();
  if ensure_result in ('account_inactive', 'email_unverified', 'needs_review') then
    raise exception 'KELUARGA volunteer profile is not ready for recruitment'
      using errcode = '42501';
  end if;

  current_volunteer_id := core.current_volunteer_id();
  if current_volunteer_id is null then
    raise exception 'KELUARGA volunteer profile is unavailable'
      using errcode = '42501';
  end if;

  if p_interest_area not in ('general', 'mentor', 'coach', 'facilitator', 'specialist', 'not_sure') then
    raise exception 'Choose a valid volunteering interest' using errcode = '22023';
  end if;
  if p_motivation is null or char_length(btrim(p_motivation)) not between 10 and 2000 then
    raise exception 'Tell us why you would like to volunteer' using errcode = '22023';
  end if;
  if p_skills_experience is not null and char_length(btrim(p_skills_experience)) > 3000 then
    raise exception 'Skills and experience response is too long' using errcode = '22023';
  end if;
  if p_availability_notes is not null and char_length(btrim(p_availability_notes)) > 1500 then
    raise exception 'Availability response is too long' using errcode = '22023';
  end if;
  if p_referral_source is not null and char_length(btrim(p_referral_source)) > 300 then
    raise exception 'Referral source is too long' using errcode = '22023';
  end if;

  select id into existing_application_id
  from public.keluarga_recruitment_applications
  where volunteer_id = current_volunteer_id
    and status in ('submitted', 'reviewing')
  order by submitted_at desc
  limit 1
  for update;

  if existing_application_id is not null then
    update public.keluarga_recruitment_applications
    set
      status = 'submitted',
      interest_area = p_interest_area,
      motivation = btrim(p_motivation),
      skills_experience = nullif(btrim(p_skills_experience), ''),
      availability_notes = nullif(btrim(p_availability_notes), ''),
      referral_source = nullif(btrim(p_referral_source), ''),
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = null,
      review_note = null,
      withdrawn_at = null,
      updated_at = now()
    where id = existing_application_id;

    return existing_application_id;
  end if;

  insert into public.keluarga_recruitment_applications(
    volunteer_id,
    interest_area,
    motivation,
    skills_experience,
    availability_notes,
    referral_source
  )
  values (
    current_volunteer_id,
    p_interest_area,
    btrim(p_motivation),
    nullif(btrim(p_skills_experience), ''),
    nullif(btrim(p_availability_notes), ''),
    nullif(btrim(p_referral_source), '')
  )
  returning id into application_id;

  return application_id;
end;
$$;

revoke all on function core.submit_keluarga_recruitment_application(text,text,text,text,text)
  from public, anon, authenticated;
grant execute on function core.submit_keluarga_recruitment_application(text,text,text,text,text)
  to authenticated, service_role;

create or replace function core.withdraw_keluarga_recruitment_application(
  p_application_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  application_record public.keluarga_recruitment_applications%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select *
  into application_record
  from public.keluarga_recruitment_applications
  where id = p_application_id
    and volunteer_id = core.current_volunteer_id()
  for update;

  if not found then
    raise exception 'Recruitment application could not be found' using errcode = 'P0002';
  end if;
  if application_record.status not in ('submitted', 'reviewing') then
    raise exception 'This recruitment application can no longer be withdrawn'
      using errcode = 'P0001';
  end if;

  update public.keluarga_recruitment_applications
  set
    status = 'withdrawn',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = 'Withdrawn by volunteer',
    withdrawn_at = now(),
    updated_at = now()
  where id = p_application_id;

  return 'withdrawn';
end;
$$;

revoke all on function core.withdraw_keluarga_recruitment_application(uuid)
  from public, anon, authenticated;
grant execute on function core.withdraw_keluarga_recruitment_application(uuid)
  to authenticated, service_role;

create or replace function core.review_keluarga_recruitment_application(
  p_application_id uuid,
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
  application_record public.keluarga_recruitment_applications%rowtype;
  normalized_status public.keluarga_recruitment_status;
begin
  if p_decision not in ('reviewing', 'accepted', 'not_selected') then
    raise exception 'Unsupported recruitment decision' using errcode = '22023';
  end if;
  normalized_status := p_decision::public.keluarga_recruitment_status;

  if not exists (
    select 1
    from core.user_accounts accounts
    join core.user_roles roles on roles.user_id = accounts.id
    where accounts.id = p_actor_user_id
      and accounts.status = 'active'
      and roles.role in ('support_officer', 'admin')
  ) then
    raise exception 'Volunteer manager authorization is required' using errcode = '42501';
  end if;

  select *
  into application_record
  from public.keluarga_recruitment_applications
  where id = p_application_id
  for update;

  if not found then
    raise exception 'Recruitment application could not be found' using errcode = 'P0002';
  end if;
  if application_record.status not in ('submitted', 'reviewing') then
    raise exception 'This recruitment application has already been closed'
      using errcode = 'P0001';
  end if;

  update public.keluarga_recruitment_applications
  set
    status = normalized_status,
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    review_note = nullif(btrim(p_note), ''),
    updated_at = now()
  where id = p_application_id;

  return normalized_status::text;
end;
$$;

revoke all on function core.review_keluarga_recruitment_application(uuid,text,text,uuid)
  from public, anon, authenticated;
grant execute on function core.review_keluarga_recruitment_application(uuid,text,text,uuid)
  to service_role;

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
  elsif new.status = 'withdrawn' then
    notification_kind := 'registration_status';
    notification_title := 'Registration withdrawn';
    notification_message := 'You have withdrawn from ' || coalesce(event_title, 'this programme') || '.';
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

create or replace function core.withdraw_keluarga_registration(
  p_registration_id uuid,
  p_reason text default null
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  registration_record public.keluarga_registrations%rowtype;
begin
  if auth.uid() is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select *
  into registration_record
  from public.keluarga_registrations
  where id = p_registration_id
    and volunteer_id = core.current_volunteer_id()
  for update;

  if not found then
    raise exception 'Registration could not be found' using errcode = 'P0002';
  end if;
  if registration_record.status not in ('pending', 'waitlisted', 'confirmed') then
    raise exception 'This registration can no longer be withdrawn'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.phaseone_roster roster
    join public.phaseone_attendance attendance
      on attendance.event_id = roster.event_id
     and attendance.roster_id = roster.id
    where roster.registration_id = p_registration_id
  ) or exists (
    select 1
    from public.phaseone_roster roster
    join public.phaseone_attendance_session_shifts link
      on link.roster_id = roster.id
     and link.event_id = roster.event_id
    where roster.registration_id = p_registration_id
  ) then
    raise exception 'Attendance has already started for this registration; contact Volunteer Management'
      using errcode = 'P0001';
  end if;

  delete from public.phaseone_roster
  where registration_id = p_registration_id;

  update public.keluarga_registrations
  set
    status = 'withdrawn',
    reviewed_by = auth.uid(),
    reviewed_at = now(),
    review_note = coalesce(nullif(btrim(p_reason), ''), 'Withdrawn by volunteer'),
    cancelled_at = now(),
    updated_at = now()
  where id = p_registration_id;

  return 'withdrawn';
end;
$$;

revoke all on function core.withdraw_keluarga_registration(uuid,text)
  from public, anon, authenticated;
grant execute on function core.withdraw_keluarga_registration(uuid,text)
  to authenticated, service_role;

create or replace function core.cancel_keluarga_registration(
  p_registration_id uuid,
  p_reason text,
  p_actor_user_id uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  registration_record public.keluarga_registrations%rowtype;
begin
  if p_reason is null or char_length(btrim(p_reason)) < 3 or char_length(btrim(p_reason)) > 1000 then
    raise exception 'A cancellation reason is required' using errcode = '22023';
  end if;

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
  if registration_record.status not in ('pending', 'waitlisted', 'confirmed') then
    raise exception 'This registration can no longer be cancelled'
      using errcode = 'P0001';
  end if;
  if exists (
    select 1
    from public.phaseone_roster roster
    join public.phaseone_attendance attendance
      on attendance.event_id = roster.event_id
     and attendance.roster_id = roster.id
    where roster.registration_id = p_registration_id
  ) or exists (
    select 1
    from public.phaseone_roster roster
    join public.phaseone_attendance_session_shifts link
      on link.roster_id = roster.id
     and link.event_id = roster.event_id
    where roster.registration_id = p_registration_id
  ) then
    raise exception 'Attendance has already started for this registration; use Event Operations reconciliation instead'
      using errcode = 'P0001';
  end if;

  delete from public.phaseone_roster
  where registration_id = p_registration_id;

  update public.keluarga_registrations
  set
    status = 'cancelled',
    reviewed_by = p_actor_user_id,
    reviewed_at = now(),
    review_note = btrim(p_reason),
    cancelled_at = now(),
    updated_at = now()
  where id = p_registration_id;

  return 'cancelled';
end;
$$;

revoke all on function core.cancel_keluarga_registration(uuid,text,uuid)
  from public, anon, authenticated;
grant execute on function core.cancel_keluarga_registration(uuid,text,uuid)
  to service_role;

create or replace function core.resolve_manual_roster_volunteer(
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  normalized_key text := upper(nullif(btrim(coalesce(p_volunteer_key, '')), ''));
  normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  normalized_mobile text := public.phaseone_canonical_mobile(p_mobile);
  key_volunteer_id uuid;
  matched_ids uuid[];
  matched_volunteer_id uuid;
  volunteer_code text;
  created boolean := false;
begin
  if p_volunteer_name is null or char_length(btrim(p_volunteer_name)) < 1 then
    raise exception 'Volunteer name is required' using errcode = '22023';
  end if;
  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120' using errcode = '22023';
  end if;

  if normalized_key ~ '^KEL[0-9]{5}$' then
    select id into key_volunteer_id
    from core.volunteers
    where volunteer_code = normalized_key;

    if key_volunteer_id is null then
      raise exception 'KELUARGA volunteer ID does not exist: %', normalized_key
        using errcode = 'P0002';
    end if;
  end if;

  select array_agg(distinct candidate.id order by candidate.id)
  into matched_ids
  from core.volunteers candidate
  where (normalized_email is not null and candidate.primary_email_normalized = normalized_email)
     or (
       normalized_mobile is not null
       and public.phaseone_canonical_mobile(candidate.mobile) = normalized_mobile
     );

  if coalesce(array_length(matched_ids, 1), 0) > 1 then
    raise exception 'Volunteer identifiers match multiple KELUARGA volunteer records'
      using errcode = 'P0001';
  end if;

  if coalesce(array_length(matched_ids, 1), 0) = 1 then
    matched_volunteer_id := matched_ids[1];
  end if;

  if key_volunteer_id is not null
     and matched_volunteer_id is not null
     and key_volunteer_id <> matched_volunteer_id then
    raise exception 'Volunteer ID, email or mobile point to different KELUARGA volunteers'
      using errcode = 'P0001';
  end if;

  matched_volunteer_id := coalesce(key_volunteer_id, matched_volunteer_id);

  if matched_volunteer_id is null then
    if normalized_email is null and normalized_mobile is null then
      raise exception 'Integrated roster rows need an existing KELUARGA volunteer ID, email or mobile number'
        using errcode = '22023';
    end if;

    insert into core.volunteers(
      display_name,
      primary_email_normalized,
      mobile,
      age
    )
    values (
      btrim(p_volunteer_name),
      normalized_email,
      nullif(btrim(p_mobile), ''),
      p_age
    )
    returning id into matched_volunteer_id;

    created := true;
  else
    update core.volunteers
    set
      display_name = coalesce(nullif(btrim(display_name), ''), btrim(p_volunteer_name)),
      primary_email_normalized = coalesce(primary_email_normalized, normalized_email),
      mobile = coalesce(mobile, nullif(btrim(p_mobile), '')),
      age = coalesce(age, p_age),
      updated_at = now()
    where id = matched_volunteer_id;
  end if;

  select v.volunteer_code into volunteer_code
  from core.volunteers v
  where v.id = matched_volunteer_id;

  return jsonb_build_object(
    'volunteer_id', matched_volunteer_id,
    'volunteer_code', volunteer_code,
    'created', created
  );
end;
$$;

revoke all on function core.resolve_manual_roster_volunteer(text,text,text,text,smallint)
  from public, anon, authenticated;
grant execute on function core.resolve_manual_roster_volunteer(text,text,text,text,smallint)
  to service_role;

create or replace function public.phaseone_apply_manual_roster_import(
  p_event_id uuid,
  p_mode text,
  p_file_name text,
  p_rows jsonb,
  p_uploaded_by uuid,
  p_integrate_volunteers boolean
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  event_scope text;
  base_result jsonb;
  import_id uuid;
  row_record record;
  roster_id uuid;
  resolved jsonb;
  resolved_volunteer_id uuid;
  resolved_volunteer_code text;
  linked_ids uuid[] := array[]::uuid[];
  created_ids uuid[] := array[]::uuid[];
begin
  select operations_scope
  into event_scope
  from public.phaseone_events
  where id = p_event_id
  for update;

  if event_scope is null then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if event_scope not in ('manual_isolated', 'manual_integrated') then
    raise exception 'This import mode is only available for manual Event Operations events'
      using errcode = 'P0001';
  end if;
  if p_integrate_volunteers is distinct from (event_scope = 'manual_integrated') then
    raise exception 'Roster integration choice does not match the manual event data scope'
      using errcode = 'P0001';
  end if;

  base_result := public.phaseone_apply_roster_import(
    p_event_id,
    p_mode,
    p_file_name,
    p_rows,
    p_uploaded_by
  );

  import_id := nullif(base_result ->> 'import_id', '')::uuid;

  if p_integrate_volunteers then
    for row_record in
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
      roster_id := public.phaseone_find_roster_match(
        p_event_id,
        row_record.timeslot_id,
        row_record.volunteer_key,
        row_record.email,
        row_record.mobile,
        row_record.volunteer_name
      );

      if roster_id is null then
        raise exception 'Imported roster row could not be reconciled after import'
          using errcode = 'P0001';
      end if;

      resolved := core.resolve_manual_roster_volunteer(
        row_record.volunteer_key,
        row_record.volunteer_name,
        row_record.email,
        row_record.mobile,
        row_record.age
      );
      resolved_volunteer_id := (resolved ->> 'volunteer_id')::uuid;
      resolved_volunteer_code := resolved ->> 'volunteer_code';

      update public.phaseone_roster
      set
        volunteer_id = resolved_volunteer_id,
        volunteer_key = coalesce(nullif(btrim(volunteer_key), ''), resolved_volunteer_code),
        source_assignment_status = 'manual_integrated'
      where id = roster_id;

      if not (resolved_volunteer_id = any(linked_ids)) then
        linked_ids := array_append(linked_ids, resolved_volunteer_id);
      end if;
      if coalesce((resolved ->> 'created')::boolean, false)
         and not (resolved_volunteer_id = any(created_ids)) then
        created_ids := array_append(created_ids, resolved_volunteer_id);
      end if;
    end loop;
  end if;

  update public.phaseone_roster_imports
  set
    integration_mode = case
      when p_integrate_volunteers then 'volunteer_database'
      else 'event_only'
    end,
    linked_volunteer_count = coalesce(array_length(linked_ids, 1), 0),
    created_volunteer_count = coalesce(array_length(created_ids, 1), 0)
  where id = import_id;

  return base_result || jsonb_build_object(
    'integration_mode', case
      when p_integrate_volunteers then 'volunteer_database'
      else 'event_only'
    end,
    'linked_volunteer_count', coalesce(array_length(linked_ids, 1), 0),
    'created_volunteer_count', coalesce(array_length(created_ids, 1), 0)
  );
end;
$$;

revoke all on function public.phaseone_apply_manual_roster_import(uuid,text,text,jsonb,uuid,boolean)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_manual_roster_import(uuid,text,text,jsonb,uuid,boolean)
  to service_role;

create or replace function core.refresh_manual_event_contribution_credits(
  p_event_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  event_record public.phaseone_events%rowtype;
  session_record public.phaseone_attendance_sessions%rowtype;
  volunteer_ids uuid[];
  target_volunteer_id uuid;
  calculated_hours numeric(8,2);
  credited_count integer := 0;
  skipped_count integer := 0;
  total_hours numeric(10,2) := 0;
begin
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

  select * into event_record
  from public.phaseone_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;
  if event_record.operations_scope <> 'manual_integrated'
     or not event_record.credit_contribution_hours then
    raise exception 'This manual event is not configured to credit KELUARGA contribution hours'
      using errcode = 'P0001';
  end if;

  update public.keluarga_contribution_credits credit
  set
    status = 'reversed',
    updated_by = p_actor_user_id,
    updated_at = now()
  where credit.event_id = p_event_id
    and credit.status = 'active'
    and not exists (
      select 1
      from public.phaseone_attendance_sessions session
      where session.id = credit.attendance_session_id
        and session.event_id = p_event_id
        and session.checked_out_at is not null
        and session.checked_out_at >= session.checked_in_at
    );

  for session_record in
    select *
    from public.phaseone_attendance_sessions
    where event_id = p_event_id
      and checked_out_at is not null
      and checked_out_at >= checked_in_at
    order by attendance_date, checked_in_at
  loop
    select array_agg(distinct roster.volunteer_id order by roster.volunteer_id)
      filter (where roster.volunteer_id is not null)
    into volunteer_ids
    from (
      select link.roster_id
      from public.phaseone_attendance_session_shifts link
      where link.session_id = session_record.id
      union
      select session_record.origin_roster_id
    ) linked
    join public.phaseone_roster roster on roster.id = linked.roster_id
    where roster.event_id = p_event_id;

    if coalesce(array_length(volunteer_ids, 1), 0) <> 1 then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    target_volunteer_id := volunteer_ids[1];
    calculated_hours := round(
      (extract(epoch from (session_record.checked_out_at - session_record.checked_in_at)) / 3600.0)::numeric,
      2
    );
    calculated_hours := least(greatest(calculated_hours, 0), 24);

    insert into public.keluarga_contribution_credits(
      volunteer_id,
      event_id,
      attendance_session_id,
      credit_hours,
      status,
      credited_by,
      updated_by
    )
    values (
      target_volunteer_id,
      p_event_id,
      session_record.id,
      calculated_hours,
      'active',
      p_actor_user_id,
      p_actor_user_id
    )
    on conflict (attendance_session_id) do update
    set
      volunteer_id = excluded.volunteer_id,
      event_id = excluded.event_id,
      credit_hours = excluded.credit_hours,
      status = 'active',
      updated_by = excluded.updated_by,
      updated_at = now();

    credited_count := credited_count + 1;
    total_hours := total_hours + calculated_hours;
  end loop;

  return jsonb_build_object(
    'credited_sessions', credited_count,
    'skipped_sessions', skipped_count,
    'total_hours', total_hours
  );
end;
$$;

revoke all on function core.refresh_manual_event_contribution_credits(uuid,uuid)
  from public, anon, authenticated;
grant execute on function core.refresh_manual_event_contribution_credits(uuid,uuid)
  to service_role;

alter table public.keluarga_recruitment_applications enable row level security;
alter table public.keluarga_recruitment_applications force row level security;
alter table public.keluarga_recruitment_status_history enable row level security;
alter table public.keluarga_recruitment_status_history force row level security;
alter table public.keluarga_contribution_credits enable row level security;
alter table public.keluarga_contribution_credits force row level security;

create policy keluarga_recruitment_select_self
on public.keluarga_recruitment_applications
for select to authenticated
using (
  (select auth.uid()) is not null
  and volunteer_id = (select core.current_volunteer_id())
);

create policy keluarga_recruitment_history_select_self
on public.keluarga_recruitment_status_history
for select to authenticated
using (
  (select auth.uid()) is not null
  and exists (
    select 1
    from public.keluarga_recruitment_applications application
    where application.id = application_id
      and application.volunteer_id = (select core.current_volunteer_id())
  )
);

create policy keluarga_contribution_credits_select_self
on public.keluarga_contribution_credits
for select to authenticated
using (
  (select auth.uid()) is not null
  and volunteer_id = (select core.current_volunteer_id())
);

revoke all on public.keluarga_recruitment_applications from public, anon, authenticated;
revoke all on public.keluarga_recruitment_status_history from public, anon, authenticated;
revoke all on public.keluarga_contribution_credits from public, anon, authenticated;

grant select on public.keluarga_recruitment_applications to authenticated;
grant select on public.keluarga_recruitment_status_history to authenticated;
grant select on public.keluarga_contribution_credits to authenticated;

grant all on public.keluarga_recruitment_applications to service_role;
grant all on public.keluarga_recruitment_status_history to service_role;
grant all on public.keluarga_contribution_credits to service_role;
grant usage, select on sequence public.keluarga_recruitment_status_history_id_seq to service_role;

comment on table public.keluarga_recruitment_applications is
  'App-owned prospective-volunteer intake and staff review workflow. It may exist before any YM Hub backend record.';
comment on table public.keluarga_recruitment_status_history is
  'Append-only recruitment application status history visible to the owning volunteer and privileged staff through server-side workflows.';
