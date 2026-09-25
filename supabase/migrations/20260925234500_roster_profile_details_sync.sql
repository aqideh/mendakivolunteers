begin;

create table if not exists public.volunteer_private_details (
  volunteer_id uuid primary key references core.volunteers(id) on delete cascade,
  date_of_birth date,
  postal_code text,
  address_line text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  neighbourhood text,
  planning_area text,
  electoral_division text,
  electoral_boundary_version text,
  address_verified_at timestamptz,
  dietary_requirements text,
  food_allergies text,
  no_known_food_allergies boolean not null default false,
  tshirt_size text,
  highest_qualification text,
  institution text,
  field_of_study text,
  languages_spoken text[] not null default '{}'::text[],
  emergency_contact_name text,
  emergency_contact_mobile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_private_details_postal_check check (
    postal_code is null or postal_code ~ '^[0-9]{6}$'
  ),
  constraint volunteer_private_details_address_check check (
    address_line is null or char_length(address_line) <= 500
  ),
  constraint volunteer_private_details_lat_check check (
    latitude is null or latitude between 1.1 and 1.6
  ),
  constraint volunteer_private_details_lng_check check (
    longitude is null or longitude between 103.5 and 104.2
  ),
  constraint volunteer_private_details_neighbourhood_check check (
    neighbourhood is null or char_length(neighbourhood) <= 120
  ),
  constraint volunteer_private_details_planning_area_check check (
    planning_area is null or char_length(planning_area) <= 120
  ),
  constraint volunteer_private_details_electoral_division_check check (
    electoral_division is null or char_length(electoral_division) <= 160
  ),
  constraint volunteer_private_details_dietary_check check (
    dietary_requirements is null or char_length(dietary_requirements) <= 800
  ),
  constraint volunteer_private_details_allergies_check check (
    food_allergies is null or char_length(food_allergies) <= 800
  ),
  constraint volunteer_private_details_allergy_consistency check (
    not no_known_food_allergies
    or food_allergies is null
    or btrim(food_allergies) = ''
  ),
  constraint volunteer_private_details_tshirt_size_check check (
    tshirt_size is null or tshirt_size in ('S','M','L','XL','2XL','3XL','5XL','7XL')
  ),
  constraint volunteer_private_details_qualification_check check (
    highest_qualification is null or highest_qualification in (
      'primary',
      'secondary',
      'n_level',
      'o_level',
      'a_level',
      'ite',
      'diploma',
      'professional_certificate',
      'bachelors',
      'postgraduate',
      'other'
    )
  ),
  constraint volunteer_private_details_institution_check check (
    institution is null or char_length(institution) <= 200
  ),
  constraint volunteer_private_details_field_of_study_check check (
    field_of_study is null or char_length(field_of_study) <= 200
  ),
  constraint volunteer_private_details_languages_check check (
    cardinality(languages_spoken) <= 12
  ),
  constraint volunteer_private_details_emergency_name_check check (
    emergency_contact_name is null or char_length(emergency_contact_name) <= 160
  ),
  constraint volunteer_private_details_emergency_mobile_check check (
    emergency_contact_mobile is null or char_length(emergency_contact_mobile) <= 40
  )
);

comment on table public.volunteer_private_details is
  'Private volunteer-maintained operational profile details keyed to the canonical core.volunteers UUID. Not public profile content.';
comment on column public.volunteer_private_details.electoral_division is
  'Derived electoral division for geographic reporting. Populate only from a verified boundary dataset.';
comment on column public.volunteer_private_details.electoral_boundary_version is
  'Boundary dataset/version used to derive electoral_division.';

drop trigger if exists volunteer_private_details_set_updated_at
  on public.volunteer_private_details;
create trigger volunteer_private_details_set_updated_at
before update on public.volunteer_private_details
for each row execute function core.set_updated_at();

alter table public.volunteer_private_details enable row level security;

drop policy if exists "Volunteers can read their private details"
  on public.volunteer_private_details;
create policy "Volunteers can read their private details"
on public.volunteer_private_details
for select
to authenticated
using (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Volunteers can create their private details"
  on public.volunteer_private_details;
create policy "Volunteers can create their private details"
on public.volunteer_private_details
for insert
to authenticated
with check (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Volunteers can update their private details"
  on public.volunteer_private_details;
create policy "Volunteers can update their private details"
on public.volunteer_private_details
for update
to authenticated
using (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Staff can read private volunteer details"
  on public.volunteer_private_details;
drop policy if exists "Volunteer team can read private volunteer details"
  on public.volunteer_private_details;
drop policy if exists "Event managers can read private volunteer details"
  on public.volunteer_private_details;
create policy "Event managers can read private volunteer details"
on public.volunteer_private_details
for select
to authenticated
using (
  exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role::text in (
        'admin',
        'attendance_manager',
        'volteam',
        'staff',
        'programme_manager'
      )
  )
);

grant select, insert, update on public.volunteer_private_details to authenticated;
grant select, insert, update on public.volunteer_private_details to service_role;

create index if not exists volunteer_private_details_tshirt_size_idx
  on public.volunteer_private_details(tshirt_size)
  where tshirt_size is not null;

create or replace function public.phaseone_add_database_volunteers_to_roster(
  p_event_id uuid,
  p_timeslot_ids uuid[],
  p_volunteer_ids uuid[],
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core, auth
as $$
declare
  v_scope text;
  v_expected integer;
  v_found integer;
  v_timeslot_id uuid;
  v_volunteer record;
  v_match_id uuid;
  v_existing_volunteer_id uuid;
  v_created integer := 0;
  v_linked integer := 0;
  v_existing integer := 0;
begin
  if p_event_id is null then
    raise exception 'Event is required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in (
        'staff',
        'volteam',
        'admin',
        'attendance_manager',
        'programme_manager'
      )
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  if p_timeslot_ids is null
     or cardinality(p_timeslot_ids) < 1
     or cardinality(p_timeslot_ids) > 100 then
    raise exception 'Select between 1 and 100 event shifts' using errcode = '22023';
  end if;

  if p_volunteer_ids is null
     or cardinality(p_volunteer_ids) < 1
     or cardinality(p_volunteer_ids) > 100 then
    raise exception 'Select between 1 and 100 volunteers' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_timeslot_ids) as item;

  if v_found <> cardinality(p_timeslot_ids) then
    raise exception 'Duplicate event shifts were selected' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_volunteer_ids) as item;

  if v_found <> cardinality(p_volunteer_ids) then
    raise exception 'Duplicate volunteers were selected' using errcode = '22023';
  end if;

  select operations_scope
  into v_scope
  from public.phaseone_events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if v_scope = 'manual_isolated' then
    raise exception 'Isolated manual events cannot link the canonical volunteer database'
      using errcode = 'P0001';
  end if;

  v_expected := cardinality(p_timeslot_ids);

  select count(*)::integer
  into v_found
  from public.phaseone_event_timeslots
  where event_id = p_event_id
    and id = any(p_timeslot_ids)
    and status <> 'cancelled';

  if v_found <> v_expected then
    raise exception 'One or more selected shifts are unavailable for this event'
      using errcode = '22023';
  end if;

  v_expected := cardinality(p_volunteer_ids);

  select count(*)::integer
  into v_found
  from core.volunteers
  where id = any(p_volunteer_ids);

  if v_found <> v_expected then
    raise exception 'One or more selected volunteers no longer exist'
      using errcode = 'P0002';
  end if;

  for v_volunteer in
    select
      id,
      volunteer_code,
      display_name,
      primary_email_normalized,
      v.mobile,
      v.age,
      details.tshirt_size,
      details.dietary_requirements
    from core.volunteers v
    left join public.volunteer_private_details details
      on details.volunteer_id = v.id
    where v.id = any(p_volunteer_ids)
    order by v.volunteer_code
  loop
    foreach v_timeslot_id in array p_timeslot_ids
    loop
      v_match_id := public.phaseone_find_roster_match(
        p_event_id,
        v_timeslot_id,
        v_volunteer.volunteer_code,
        v_volunteer.primary_email_normalized,
        v_volunteer.mobile,
        coalesce(nullif(btrim(v_volunteer.display_name), ''), v_volunteer.volunteer_code)
      );

      if v_match_id is null then
        insert into public.phaseone_roster (
          event_id,
          timeslot_id,
          volunteer_key,
          volunteer_name,
          email,
          mobile,
          age,
          tshirt_size,
          dietary_requirements,
          volunteer_id,
          entry_method,
          source_assignment_status,
          uploaded_by,
          uploaded_at
        )
        values (
          p_event_id,
          v_timeslot_id,
          v_volunteer.volunteer_code,
          coalesce(nullif(btrim(v_volunteer.display_name), ''), v_volunteer.volunteer_code),
          v_volunteer.primary_email_normalized,
          v_volunteer.mobile,
          v_volunteer.age,
          v_volunteer.tshirt_size,
          v_volunteer.dietary_requirements,
          v_volunteer.id,
          'staff_database',
          'staff_added_from_database',
          p_actor_user_id,
          now()
        );

        v_created := v_created + 1;
      else
        select volunteer_id
        into v_existing_volunteer_id
        from public.phaseone_roster
        where id = v_match_id
        for update;

        if v_existing_volunteer_id is not null
           and v_existing_volunteer_id <> v_volunteer.id then
          raise exception 'Existing roster assignment is linked to a different volunteer'
            using errcode = '23505';
        end if;

        update public.phaseone_roster
        set
          volunteer_id = v_volunteer.id,
          volunteer_key = v_volunteer.volunteer_code,
          volunteer_name = coalesce(
            nullif(btrim(v_volunteer.display_name), ''),
            v_volunteer.volunteer_code
          ),
          email = coalesce(v_volunteer.primary_email_normalized, email),
          mobile = coalesce(v_volunteer.mobile, mobile),
          age = coalesce(v_volunteer.age, age),
          tshirt_size = coalesce(v_volunteer.tshirt_size, tshirt_size),
          dietary_requirements = coalesce(
            v_volunteer.dietary_requirements,
            dietary_requirements
          ),
          source_assignment_status = coalesce(
            source_assignment_status,
            'staff_linked_from_database'
          ),
          uploaded_by = p_actor_user_id,
          uploaded_at = now()
        where id = v_match_id;

        if v_existing_volunteer_id is null then
          v_linked := v_linked + 1;
        else
          v_existing := v_existing + 1;
        end if;
      end if;
    end loop;
  end loop;

  return jsonb_build_object(
    'requested_assignments',
    cardinality(p_volunteer_ids) * cardinality(p_timeslot_ids),
    'created_assignments',
    v_created,
    'linked_existing_assignments',
    v_linked,
    'already_assigned',
    v_existing
  );
end;
$$;

revoke all on function public.phaseone_add_database_volunteers_to_roster(
  uuid,
  uuid[],
  uuid[],
  uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_add_database_volunteers_to_roster(
  uuid,
  uuid[],
  uuid[],
  uuid
) to service_role;

create or replace function public.phaseone_admin_create_or_link_volunteer_to_roster(
  p_event_id uuid,
  p_timeslot_ids uuid[],
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_age smallint,
  p_tshirt_size text,
  p_dietary_requirements text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core, auth, audit
as $$
declare
  v_scope text;
  v_expected integer;
  v_found integer;
  v_normalized_email text := lower(nullif(btrim(coalesce(p_email, '')), ''));
  v_normalized_mobile text := public.phaseone_canonical_mobile(p_mobile);
  v_normalized_tshirt text := upper(nullif(btrim(coalesce(p_tshirt_size, '')), ''));
  v_normalized_dietary text := nullif(btrim(coalesce(p_dietary_requirements, '')), '');
  v_resolved jsonb;
  v_volunteer_id uuid;
  v_volunteer_code text;
  v_created boolean;
  v_assignment_result jsonb;
begin
  if p_event_id is null then
    raise exception 'Event is required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in (
        'staff',
        'volteam',
        'admin',
        'attendance_manager',
        'programme_manager'
      )
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  if p_volunteer_name is null
     or char_length(btrim(p_volunteer_name)) < 1
     or char_length(btrim(p_volunteer_name)) > 120 then
    raise exception 'Volunteer name is required and must be 120 characters or fewer'
      using errcode = '22023';
  end if;

  if v_normalized_email is null and v_normalized_mobile is null then
    raise exception 'Email or mobile number is required for a new roster volunteer'
      using errcode = '22023';
  end if;

  if v_normalized_email is not null
     and (
       char_length(v_normalized_email) < 3
       or char_length(v_normalized_email) > 254
       or v_normalized_email not like '%@%'
     ) then
    raise exception 'Enter a valid email address' using errcode = '22023';
  end if;

  if p_age is not null and (p_age < 0 or p_age > 120) then
    raise exception 'Age must be between 0 and 120' using errcode = '22023';
  end if;

  if v_normalized_tshirt is not null
     and v_normalized_tshirt not in ('S','M','L','XL','2XL','3XL','5XL','7XL') then
    raise exception 'Choose a supported T-shirt size' using errcode = '22023';
  end if;

  if v_normalized_dietary is not null
     and char_length(v_normalized_dietary) > 500 then
    raise exception 'Dietary requirements must be 500 characters or fewer'
      using errcode = '22023';
  end if;

  if p_timeslot_ids is null
     or cardinality(p_timeslot_ids) < 1
     or cardinality(p_timeslot_ids) > 100 then
    raise exception 'Select between 1 and 100 event shifts' using errcode = '22023';
  end if;

  select count(distinct item)::integer
  into v_found
  from unnest(p_timeslot_ids) as item;

  if v_found <> cardinality(p_timeslot_ids) then
    raise exception 'Duplicate event shifts were selected' using errcode = '22023';
  end if;

  select operations_scope
  into v_scope
  from public.phaseone_events
  where id = p_event_id;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if v_scope = 'manual_isolated' then
    raise exception 'Isolated manual events cannot create or link canonical volunteers'
      using errcode = 'P0001';
  end if;

  v_expected := cardinality(p_timeslot_ids);

  select count(*)::integer
  into v_found
  from public.phaseone_event_timeslots
  where event_id = p_event_id
    and id = any(p_timeslot_ids)
    and status <> 'cancelled';

  if v_found <> v_expected then
    raise exception 'One or more selected shifts are unavailable for this event'
      using errcode = '22023';
  end if;

  v_resolved := core.resolve_manual_roster_volunteer(
    null,
    btrim(p_volunteer_name),
    v_normalized_email,
    nullif(btrim(coalesce(p_mobile, '')), ''),
    p_age
  );

  v_volunteer_id := nullif(v_resolved ->> 'volunteer_id', '')::uuid;
  v_volunteer_code := v_resolved ->> 'volunteer_code';
  v_created := coalesce((v_resolved ->> 'created')::boolean, false);

  if v_volunteer_id is null or v_volunteer_code is null then
    raise exception 'Volunteer identity could not be resolved' using errcode = 'P0001';
  end if;

  if v_normalized_email is not null then
    update core.volunteers
    set
      account_access_eligible = true,
      updated_at = now()
    where id = v_volunteer_id
      and auth_user_id is null;
  end if;

  if v_normalized_tshirt is not null or v_normalized_dietary is not null then
    insert into public.volunteer_private_details (
      volunteer_id,
      tshirt_size,
      dietary_requirements
    )
    values (
      v_volunteer_id,
      v_normalized_tshirt,
      v_normalized_dietary
    )
    on conflict (volunteer_id) do update
    set
      tshirt_size = coalesce(
        excluded.tshirt_size,
        public.volunteer_private_details.tshirt_size
      ),
      dietary_requirements = coalesce(
        excluded.dietary_requirements,
        public.volunteer_private_details.dietary_requirements
      ),
      updated_at = now();
  end if;

  v_assignment_result := public.phaseone_add_database_volunteers_to_roster(
    p_event_id,
    p_timeslot_ids,
    array[v_volunteer_id],
    p_actor_user_id
  );

  update public.phaseone_roster
  set
    tshirt_size = coalesce(v_normalized_tshirt, tshirt_size),
    dietary_requirements = coalesce(v_normalized_dietary, dietary_requirements),
    source_assignment_status = case
      when source_assignment_status in (
        'staff_added_from_database',
        'staff_linked_from_database'
      ) or source_assignment_status is null
        then case
          when v_created then 'staff_created_volunteer'
          else 'staff_manual_linked'
        end
      else source_assignment_status
    end
  where event_id = p_event_id
    and timeslot_id = any(p_timeslot_ids)
    and volunteer_id = v_volunteer_id;

  return coalesce(v_assignment_result, '{}'::jsonb) || jsonb_build_object(
    'volunteer_id', v_volunteer_id,
    'volunteer_code', v_volunteer_code,
    'volunteer_created', v_created,
    'display_name', (
      select display_name
      from core.volunteers
      where id = v_volunteer_id
    )
  );
end;
$$;

revoke all on function public.phaseone_admin_create_or_link_volunteer_to_roster(
  uuid,
  uuid[],
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_admin_create_or_link_volunteer_to_roster(
  uuid,
  uuid[],
  text,
  text,
  text,
  smallint,
  text,
  text,
  uuid
) to service_role;

create or replace function public.phaseone_admin_update_roster_profile_details(
  p_event_id uuid,
  p_volunteer_id uuid,
  p_tshirt_size text,
  p_dietary_requirements text,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, core, auth, audit
as $$
declare
  v_normalized_tshirt text := upper(nullif(btrim(coalesce(p_tshirt_size, '')), ''));
  v_normalized_dietary text := nullif(btrim(coalesce(p_dietary_requirements, '')), '');
  v_roster_rows integer;
begin
  if p_event_id is null or p_volunteer_id is null then
    raise exception 'Event and volunteer are required' using errcode = '22023';
  end if;

  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in (
        'admin',
        'attendance_manager',
        'volteam',
        'staff',
        'programme_manager'
      )
  ) then
    raise exception 'Event manager authorization is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.phaseone_events
    where id = p_event_id
      and operations_scope <> 'manual_isolated'
  ) then
    raise exception 'Event does not support canonical volunteer profile updates'
      using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from core.volunteers
    where id = p_volunteer_id
  ) then
    raise exception 'Volunteer not found' using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.phaseone_roster
    where event_id = p_event_id
      and volunteer_id = p_volunteer_id
  ) then
    raise exception 'Volunteer is not linked to this event roster'
      using errcode = 'P0002';
  end if;

  if v_normalized_tshirt is not null
     and v_normalized_tshirt not in ('S','M','L','XL','2XL','3XL','5XL','7XL') then
    raise exception 'Choose a supported T-shirt size' using errcode = '22023';
  end if;

  if v_normalized_dietary is not null
     and char_length(v_normalized_dietary) > 800 then
    raise exception 'Dietary requirements must be 800 characters or fewer'
      using errcode = '22023';
  end if;

  insert into public.volunteer_private_details (
    volunteer_id,
    tshirt_size,
    dietary_requirements
  )
  values (
    p_volunteer_id,
    v_normalized_tshirt,
    v_normalized_dietary
  )
  on conflict (volunteer_id) do update
  set
    tshirt_size = excluded.tshirt_size,
    dietary_requirements = excluded.dietary_requirements,
    updated_at = now();

  update public.phaseone_roster
  set
    tshirt_size = v_normalized_tshirt,
    dietary_requirements = v_normalized_dietary
  where event_id = p_event_id
    and volunteer_id = p_volunteer_id;

  get diagnostics v_roster_rows = row_count;

  perform audit.write_event(
    'volunteer.roster_profile_details_updated',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'event_id', p_event_id,
      'tshirt_size', v_normalized_tshirt,
      'dietary_requirements_present', v_normalized_dietary is not null,
      'roster_rows_updated', v_roster_rows
    ),
    p_actor_user_id,
    null
  );

  return jsonb_build_object(
    'volunteer_id', p_volunteer_id,
    'tshirt_size', v_normalized_tshirt,
    'dietary_requirements', v_normalized_dietary,
    'roster_rows_updated', v_roster_rows
  );
end;
$$;

revoke all on function public.phaseone_admin_update_roster_profile_details(
  uuid,
  uuid,
  text,
  text,
  uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_admin_update_roster_profile_details(
  uuid,
  uuid,
  text,
  text,
  uuid
) to service_role;

commit;
