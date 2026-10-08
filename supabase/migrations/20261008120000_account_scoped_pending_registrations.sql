-- Keep registration intent attached to the authenticated account while canonical
-- volunteer identity is under review. Pending registrations reserve capacity
-- transactionally but cannot be confirmed or rostered until identity resolves.

alter table public.keluarga_registrations
  add column if not exists auth_user_id uuid,
  add column if not exists identity_state text not null default 'resolved',
  add column if not exists identity_resolved_at timestamptz,
  add column if not exists identity_resolved_by uuid,
  add column if not exists identity_note text;

alter table public.keluarga_registrations
  alter column volunteer_id drop not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keluarga_registrations'::regclass
      and conname = 'keluarga_registrations_auth_user_id_fkey'
  ) then
    alter table public.keluarga_registrations
      add constraint keluarga_registrations_auth_user_id_fkey
      foreign key (auth_user_id) references core.user_accounts(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keluarga_registrations'::regclass
      and conname = 'keluarga_registrations_identity_resolved_by_fkey'
  ) then
    alter table public.keluarga_registrations
      add constraint keluarga_registrations_identity_resolved_by_fkey
      foreign key (identity_resolved_by) references auth.users(id) on delete set null;
  end if;
end
$$;

update public.keluarga_registrations registration
set auth_user_id = volunteer.auth_user_id
from core.volunteers volunteer
where volunteer.id = registration.volunteer_id
  and registration.auth_user_id is null
  and volunteer.auth_user_id is not null;

update public.keluarga_registrations
set identity_state = case when volunteer_id is null then 'needs_review' else 'resolved' end
where identity_state not in ('resolved','needs_review')
   or (volunteer_id is null and identity_state <> 'needs_review')
   or (volunteer_id is not null and identity_state <> 'resolved');

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keluarga_registrations'::regclass
      and conname = 'keluarga_registrations_identity_state_check'
  ) then
    alter table public.keluarga_registrations
      add constraint keluarga_registrations_identity_state_check
      check (identity_state in ('resolved','needs_review'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.keluarga_registrations'::regclass
      and conname = 'keluarga_registrations_identity_owner_check'
  ) then
    alter table public.keluarga_registrations
      add constraint keluarga_registrations_identity_owner_check
      check (
        (identity_state = 'resolved' and volunteer_id is not null)
        or
        (identity_state = 'needs_review' and volunteer_id is null and auth_user_id is not null)
      );
  end if;
end
$$;

create unique index if not exists keluarga_registrations_auth_user_event_key
  on public.keluarga_registrations(auth_user_id,event_id)
  where auth_user_id is not null;

create index if not exists keluarga_registrations_identity_review_idx
  on public.keluarga_registrations(identity_state,status,submitted_at)
  where identity_state = 'needs_review';

comment on column public.keluarga_registrations.auth_user_id is
  'Authenticated account that submitted the registration. This remains the owner while canonical volunteer identity is unresolved.';
comment on column public.keluarga_registrations.identity_state is
  'resolved when volunteer_id is canonical; needs_review when the registration is held against auth_user_id pending manual identity review.';
comment on column public.keluarga_registrations.identity_note is
  'Operational note about identity resolution; never grants roster or attendance access by itself.';

drop policy if exists keluarga_registrations_select_self
  on public.keluarga_registrations;

create policy keluarga_registrations_select_self
on public.keluarga_registrations
for select
to authenticated
using (
  auth_user_id = auth.uid()
  or volunteer_id = (select core.current_volunteer_id())
);

drop policy if exists keluarga_registration_shifts_select_self
  on public.keluarga_registration_shifts;

create policy keluarga_registration_shifts_select_self
on public.keluarga_registration_shifts
for select
to authenticated
using (
  exists (
    select 1
    from public.keluarga_registrations registration
    where registration.id = keluarga_registration_shifts.registration_id
      and (
        registration.auth_user_id = auth.uid()
        or registration.volunteer_id = (select core.current_volunteer_id())
      )
  )
);

create or replace function core.attach_pending_keluarga_registrations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.keluarga_registrations%rowtype;
  v_existing public.keluarga_registrations%rowtype;
  v_selected jsonb;
begin
  if new.auth_user_id is null
     or (tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id) then
    return new;
  end if;

  for v_pending in
    select *
    from public.keluarga_registrations
    where auth_user_id = new.auth_user_id
      and volunteer_id is null
      and identity_state = 'needs_review'
    order by submitted_at,id
    for update
  loop
    v_existing := null;

    select *
    into v_existing
    from public.keluarga_registrations
    where volunteer_id = new.id
      and event_id = v_pending.event_id
      and id <> v_pending.id
    order by submitted_at,id
    limit 1
    for update;

    if found then
      select coalesce(jsonb_agg(selection.timeslot_id order by selection.timeslot_id),'[]'::jsonb)
      into v_selected
      from public.keluarga_registration_shifts selection
      where selection.registration_id = v_pending.id;

      if v_existing.status in ('pending','waitlisted') then
        insert into public.keluarga_registration_shifts(registration_id,timeslot_id)
        select v_existing.id,selection.timeslot_id
        from public.keluarga_registration_shifts selection
        where selection.registration_id = v_pending.id
        on conflict do nothing;
      end if;

      update public.keluarga_registrations
      set
        auth_user_id = coalesce(auth_user_id,new.auth_user_id),
        identity_state = 'resolved',
        identity_resolved_at = coalesce(identity_resolved_at,now()),
        identity_note = coalesce(identity_note,'Canonical volunteer identity resolved from authenticated account.'),
        updated_at = now()
      where id = v_existing.id;

      perform audit.write_event(
        'keluarga.registration_identity_collision_collapsed',
        'keluarga_registration',
        v_existing.id::text,
        jsonb_build_object(
          'superseded_registration_id',v_pending.id,
          'volunteer_id',new.id,
          'auth_user_id',new.auth_user_id,
          'superseded_status',v_pending.status,
          'superseded_timeslot_ids',v_selected,
          'existing_status',v_existing.status
        ),
        null,
        null
      );

      delete from public.keluarga_registrations
      where id = v_pending.id;
    else
      update public.keluarga_registrations
      set
        volunteer_id = new.id,
        identity_state = 'resolved',
        identity_resolved_at = now(),
        identity_note = 'Canonical volunteer identity resolved from authenticated account.',
        updated_at = now()
      where id = v_pending.id;

      perform audit.write_event(
        'keluarga.registration_identity_resolved',
        'keluarga_registration',
        v_pending.id::text,
        jsonb_build_object(
          'volunteer_id',new.id,
          'auth_user_id',new.auth_user_id
        ),
        null,
        null
      );
    end if;
  end loop;

  return new;
end;
$$;

revoke all on function core.attach_pending_keluarga_registrations()
  from public,anon,authenticated;

drop trigger if exists attach_pending_keluarga_registrations
  on core.volunteers;

create trigger attach_pending_keluarga_registrations
after insert or update of auth_user_id on core.volunteers
for each row
execute function core.attach_pending_keluarga_registrations();

alter table core.account_link_cases
  drop constraint if exists account_link_cases_review_outcome_check;

alter table core.account_link_cases
  add constraint account_link_cases_review_outcome_check check (
    review_outcome is null
    or review_outcome in (
      'approved_new',
      'matched_existing_deferred',
      'refill_required',
      'merged_existing',
      'linked_existing'
    )
  );

create or replace function core.link_reconciled_account_to_existing_volunteer(
  p_case_id uuid,
  p_candidate_volunteer_id uuid,
  p_actor_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case core.account_link_cases%rowtype;
  v_account core.user_accounts%rowtype;
  v_target core.volunteers%rowtype;
  v_existing_link uuid;
begin
  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in ('admin','volteam')
  ) then
    raise exception 'Volunteer reconciliation manager authorization is required'
      using errcode = '42501';
  end if;

  select *
  into v_case
  from core.account_link_cases
  where id = p_case_id
    and status in ('pending','needs_review')
  for update;

  if not found then
    raise exception 'This reconciliation case is no longer pending'
      using errcode = 'P0002';
  end if;

  select *
  into v_account
  from core.user_accounts
  where id = v_case.auth_user_id
  for update;

  if not found
     or v_account.status <> 'active'
     or not coalesce(v_account.email_ownership_verified,false)
     or nullif(btrim(coalesce(v_account.claimed_email_normalized,'')),'') is null then
    raise exception 'The account must have a verified email before identity linking'
      using errcode = 'P0001';
  end if;

  select *
  into v_target
  from core.volunteers
  where id = p_candidate_volunteer_id
  for update;

  if not found then
    raise exception 'The selected canonical volunteer could not be found'
      using errcode = 'P0002';
  end if;

  select id
  into v_existing_link
  from core.volunteers
  where auth_user_id = v_case.auth_user_id
    and id <> v_target.id
  limit 1;

  if v_existing_link is not null then
    raise exception 'This account is already linked to another volunteer and requires identity merge review'
      using errcode = 'P0001';
  end if;

  if v_target.auth_user_id is not null
     and v_target.auth_user_id <> v_case.auth_user_id then
    raise exception 'The selected volunteer already has a different login'
      using errcode = 'P0001';
  end if;

  update core.volunteers
  set
    auth_user_id = v_case.auth_user_id,
    primary_email_normalized = lower(btrim(v_account.claimed_email_normalized)),
    updated_at = now()
  where id = v_target.id;

  perform core.ensure_maklom_profile_extension(v_target.id,'reconciled_account');

  update core.account_link_cases
  set
    status = 'resolved',
    reason_code = 'verified_account_linked_to_existing',
    review_outcome = 'linked_existing',
    candidate_volunteer_id = v_target.id,
    requested_sections = '{}'::text[],
    volunteer_message = null,
    resolution_notes = nullif(btrim(coalesce(p_notes,'')),''),
    resolved_by = p_actor_user_id,
    resolved_at = now(),
    updated_at = now()
  where id = v_case.id;

  perform audit.write_event(
    'volunteer.account_linked_to_existing',
    'volunteer',
    v_target.id::text,
    jsonb_build_object(
      'case_id',v_case.id,
      'auth_user_id',v_case.auth_user_id,
      'volunteer_code',v_target.volunteer_code,
      'verified_email',lower(btrim(v_account.claimed_email_normalized))
    ),
    p_actor_user_id,
    null
  );

  return jsonb_build_object(
    'volunteer_id',v_target.id,
    'volunteer_code',v_target.volunteer_code,
    'auth_user_id',v_case.auth_user_id
  );
end;
$$;

revoke all on function core.link_reconciled_account_to_existing_volunteer(uuid,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function core.link_reconciled_account_to_existing_volunteer(uuid,uuid,uuid,text)
  to service_role;

create or replace function core.submit_keluarga_registration(
  p_event_id uuid,
  p_timeslot_ids uuid[]
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, public, auth, audit
as $$
declare
  current_user_id uuid := auth.uid();
  ensure_result text;
  event_record public.phaseone_events%rowtype;
  existing_registration public.keluarga_registrations%rowtype;
  timeslot_record public.phaseone_event_timeslots%rowtype;
  v_registration_id uuid;
  v_volunteer_id uuid;
  selected_count integer;
  reserved_count integer;
  v_identity_state text;
  v_registration_status public.keluarga_registration_status := 'pending';
  v_waitlisted boolean := false;
  v_auth_email_confirmed_at timestamptz;
  v_explicit_unverified boolean;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select
    auth_user.email_confirmed_at,
    coalesce(auth_user.raw_app_meta_data ->> 'keluarga_email_ownership_verified','true') = 'false'
  into
    v_auth_email_confirmed_at,
    v_explicit_unverified
  from auth.users auth_user
  where auth_user.id = current_user_id;

  if v_auth_email_confirmed_at is null or coalesce(v_explicit_unverified,false) then
    raise exception 'A verified email is required before registration'
      using errcode = '42501';
  end if;

  ensure_result := core.ensure_current_keluarga_volunteer();

  if ensure_result in (
    'account_inactive',
    'email_unverified',
    'created_unverified',
    'staff_account',
    'staff_access_required'
  ) then
    raise exception 'KELUARGA volunteer profile is not ready for registration'
      using errcode = '42501';
  end if;

  if ensure_result = 'needs_review' then
    v_volunteer_id := null;
    v_identity_state := 'needs_review';

    update core.account_link_cases
    set
      submitted_for_review_at = coalesce(submitted_for_review_at,now()),
      updated_at = now()
    where auth_user_id = current_user_id
      and status in ('pending','needs_review');
  else
    select id
    into v_volunteer_id
    from core.volunteers
    where auth_user_id = current_user_id
    limit 1;

    if v_volunteer_id is null then
      raise exception 'KELUARGA volunteer profile is unavailable'
        using errcode = '42501';
    end if;

    v_identity_state := 'resolved';
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
    raise exception 'This opportunity is not open for registration'
      using errcode = 'P0002';
  end if;

  if event_record.registration_deadline is not null
     and event_record.registration_deadline < now() then
    raise exception 'The registration deadline has passed'
      using errcode = 'P0001';
  end if;

  select *
  into existing_registration
  from public.keluarga_registrations
  where event_id = p_event_id
    and (
      auth_user_id = current_user_id
      or (v_volunteer_id is not null and volunteer_id = v_volunteer_id)
    )
  order by case when auth_user_id = current_user_id then 0 else 1 end,submitted_at,id
  limit 1
  for update;

  if found then
    if existing_registration.status not in ('pending','withdrawn','cancelled') then
      raise exception 'This registration has already been reviewed'
        using errcode = 'P0001';
    end if;
    v_registration_id := existing_registration.id;
  else
    v_registration_id := gen_random_uuid();
  end if;

  for timeslot_record in
    select timeslot.*
    from public.phaseone_event_timeslots timeslot
    where timeslot.event_id = p_event_id
      and timeslot.id = any(p_timeslot_ids)
    order by timeslot.starts_at,timeslot.sort_order,timeslot.id
    for update
  loop
    if timeslot_record.status <> 'scheduled' then
      raise exception 'One or more selected shifts are unavailable'
        using errcode = '22023';
    end if;

    if timeslot_record.registration_capacity is not null then
      select count(distinct registration.id)::integer
      into reserved_count
      from public.keluarga_registration_shifts selection
      join public.keluarga_registrations registration
        on registration.id = selection.registration_id
      where selection.timeslot_id = timeslot_record.id
        and registration.status in ('pending','confirmed')
        and registration.id <> v_registration_id;

      if reserved_count >= timeslot_record.registration_capacity then
        v_waitlisted := true;
      end if;
    end if;
  end loop;

  select count(*)::integer
  into selected_count
  from public.phaseone_event_timeslots
  where event_id = p_event_id
    and id = any(p_timeslot_ids)
    and status = 'scheduled';

  if selected_count <> cardinality(p_timeslot_ids) then
    raise exception 'One or more selected shifts are unavailable'
      using errcode = '22023';
  end if;

  if v_waitlisted then
    v_registration_status := 'waitlisted';
  end if;

  if existing_registration.id is not null then
    delete from public.keluarga_registration_shifts
    where registration_id = v_registration_id;

    update public.keluarga_registrations
    set
      volunteer_id = v_volunteer_id,
      auth_user_id = current_user_id,
      identity_state = v_identity_state,
      identity_resolved_at = case when v_identity_state = 'resolved' then coalesce(identity_resolved_at,now()) else null end,
      identity_resolved_by = case when v_identity_state = 'resolved' then identity_resolved_by else null end,
      identity_note = case when v_identity_state = 'needs_review'
        then 'Volunteer Management must resolve canonical identity before confirmation.'
        else null end,
      status = v_registration_status,
      submitted_at = now(),
      reviewed_by = null,
      reviewed_at = case when v_registration_status = 'waitlisted' then now() else null end,
      review_note = case when v_registration_status = 'waitlisted'
        then 'Automatically waitlisted because at least one selected shift is fully reserved.'
        else null end,
      waitlisted_at = case when v_registration_status = 'waitlisted' then now() else null end,
      cancelled_at = null,
      handoff_status = 'not_sent',
      updated_at = now()
    where id = v_registration_id;
  else
    insert into public.keluarga_registrations(
      id,
      volunteer_id,
      auth_user_id,
      event_id,
      identity_state,
      identity_resolved_at,
      identity_note,
      status,
      reviewed_at,
      review_note,
      waitlisted_at
    )
    values (
      v_registration_id,
      v_volunteer_id,
      current_user_id,
      p_event_id,
      v_identity_state,
      case when v_identity_state = 'resolved' then now() else null end,
      case when v_identity_state = 'needs_review'
        then 'Volunteer Management must resolve canonical identity before confirmation.'
        else null end,
      v_registration_status,
      case when v_registration_status = 'waitlisted' then now() else null end,
      case when v_registration_status = 'waitlisted'
        then 'Automatically waitlisted because at least one selected shift is fully reserved.'
        else null end,
      case when v_registration_status = 'waitlisted' then now() else null end
    );
  end if;

  insert into public.keluarga_registration_shifts(registration_id,timeslot_id)
  select v_registration_id,item
  from unnest(p_timeslot_ids) as item;

  perform audit.write_event(
    'keluarga.registration_submitted',
    'keluarga_registration',
    v_registration_id::text,
    jsonb_build_object(
      'event_id',p_event_id,
      'auth_user_id',current_user_id,
      'volunteer_id',v_volunteer_id,
      'identity_state',v_identity_state,
      'ensure_result',ensure_result,
      'status',v_registration_status,
      'timeslot_ids',to_jsonb(p_timeslot_ids)
    ),
    current_user_id,
    null
  );

  return v_registration_id;
end;
$$;

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
  reserved_count integer;
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
        into reserved_count
        from public.keluarga_registration_shifts selection
        join public.keluarga_registrations registration
          on registration.id = selection.registration_id
        where selection.timeslot_id = timeslot_record.id
          and registration.status in ('pending','confirmed')
          and registration.id <> p_registration_id;

        if reserved_count >= timeslot_record.registration_capacity then
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
    and (
      auth_user_id = auth.uid()
      or volunteer_id = core.current_volunteer_id()
    )
  for update;

  if not found then
    raise exception 'Registration could not be found' using errcode = 'P0002';
  end if;

  if registration_record.status not in ('pending','waitlisted','confirmed') then
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
    review_note = coalesce(nullif(btrim(p_reason),''),'Withdrawn by volunteer'),
    cancelled_at = now(),
    updated_at = now()
  where id = p_registration_id;

  return 'withdrawn';
end;
$$;
