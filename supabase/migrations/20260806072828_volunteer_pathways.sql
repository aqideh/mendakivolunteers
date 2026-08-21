begin;

create schema if not exists pathways;
comment on schema pathways is
  'Versioned volunteer pathway maps and staff-managed progression definitions.';

revoke all on schema pathways from public;
grant usage on schema pathways to anon, authenticated, service_role;

create type pathways.version_status as enum (
  'draft',
  'published',
  'archived'
);

create table pathways.maps (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (
    slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(slug) between 3 and 100
  ),
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pathways.map_versions (
  id uuid primary key default gen_random_uuid(),
  map_id uuid not null references pathways.maps (id) on delete restrict,
  version_number integer not null check (version_number > 0),
  status pathways.version_status not null default 'draft',
  name text not null check (char_length(name) between 3 and 120),
  introduction text not null check (char_length(introduction) between 20 and 1200),
  explorer_title text not null default 'Explorer' check (
    char_length(explorer_title) between 2 and 80
  ),
  explorer_description text not null check (
    char_length(explorer_description) between 10 and 500
  ),
  footer_note text not null check (char_length(footer_note) between 10 and 500),
  created_by uuid references core.user_accounts (id) on delete set null,
  published_by uuid references core.user_accounts (id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (map_id, version_number),
  constraint map_versions_publication_metadata check (
    (status = 'draft' and published_at is null)
    or (status in ('published', 'archived') and published_at is not null)
  )
);

alter table pathways.maps
  add constraint maps_active_version_fk
  foreign key (active_version_id)
  references pathways.map_versions (id)
  on delete restrict;

create table pathways.phases (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references pathways.map_versions (id) on delete cascade,
  stable_key text not null check (
    stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(stable_key) between 2 and 60
  ),
  name text not null check (char_length(name) between 2 and 80),
  description text not null check (char_length(description) between 10 and 500),
  sort_order smallint not null check (sort_order between 1 and 20),
  unique (version_id, stable_key),
  unique (version_id, sort_order) deferrable initially deferred,
  unique (id, version_id)
);

create table pathways.tracks (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references pathways.map_versions (id) on delete cascade,
  stable_key text not null check (
    stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(stable_key) between 2 and 60
  ),
  name text not null check (char_length(name) between 2 and 100),
  short_name text not null check (char_length(short_name) between 2 and 40),
  description text not null check (char_length(description) between 10 and 500),
  color_token text not null check (
    color_token in ('green', 'purple', 'teal', 'yellow')
  ),
  sort_order smallint not null check (sort_order between 1 and 20),
  unique (version_id, stable_key),
  unique (version_id, sort_order) deferrable initially deferred,
  unique (id, version_id)
);

create table pathways.stages (
  id uuid primary key default gen_random_uuid(),
  version_id uuid not null references pathways.map_versions (id) on delete cascade,
  track_id uuid not null,
  phase_id uuid not null,
  stable_key text not null check (
    stable_key ~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
    and char_length(stable_key) between 3 and 130
  ),
  title text not null check (char_length(title) between 2 and 180),
  description text not null check (char_length(description) between 10 and 800),
  is_active boolean not null default true,
  unique (version_id, stable_key),
  unique (version_id, track_id, phase_id),
  unique (id, version_id),
  foreign key (track_id, version_id)
    references pathways.tracks (id, version_id)
    on delete cascade,
  foreign key (phase_id, version_id)
    references pathways.phases (id, version_id)
    on delete cascade
);

create table pathways.stage_roles (
  id uuid primary key default gen_random_uuid(),
  stage_id uuid not null references pathways.stages (id) on delete cascade,
  stable_key text not null check (
    stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(stable_key) between 2 and 60
  ),
  name text not null check (char_length(name) between 2 and 120),
  sort_order smallint not null check (sort_order between 1 and 10),
  unique (stage_id, stable_key),
  unique (stage_id, sort_order)
);

create index map_versions_map_status_idx
  on pathways.map_versions (map_id, status, version_number desc);
create unique index map_versions_one_draft_per_map_idx
  on pathways.map_versions (map_id)
  where status = 'draft';
create index phases_version_order_idx
  on pathways.phases (version_id, sort_order);
create index tracks_version_order_idx
  on pathways.tracks (version_id, sort_order);
create index stages_version_track_phase_idx
  on pathways.stages (version_id, track_id, phase_id);
create index stage_roles_stage_order_idx
  on pathways.stage_roles (stage_id, sort_order);

create trigger maps_set_updated_at
before update on pathways.maps
for each row execute function core.set_updated_at();

create trigger map_versions_set_updated_at
before update on pathways.map_versions
for each row execute function core.set_updated_at();

create or replace function core.issue_staff_password_setup_token(
  p_user_id uuid,
  p_token_hash text,
  p_created_by uuid,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core
as $$
declare
  issued_token_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Password setup token hash is invalid'
      using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'Password setup token expiry is invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles
      on roles.user_id = accounts.id
    where accounts.id = p_created_by
      and accounts.status = 'active'
      and roles.role = 'admin'
  ) then
    raise exception 'Only active administrators can issue staff password setup links'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles
      on roles.user_id = accounts.id
    where accounts.id = p_user_id
      and accounts.status in ('pending_link', 'active')
      and roles.role in ('attendance_manager', 'pathway_manager', 'admin')
  ) then
    raise exception 'Password setup links are limited to active staff accounts'
      using errcode = '42501';
  end if;

  update core.staff_password_setup_tokens
  set
    revoked_at = now(),
    revoked_by = p_created_by
  where user_id = p_user_id
    and consumed_at is null
    and revoked_at is null;

  insert into core.staff_password_setup_tokens (
    user_id,
    token_hash,
    created_by,
    expires_at
  ) values (
    p_user_id,
    p_token_hash,
    p_created_by,
    p_expires_at
  )
  returning id into issued_token_id;

  return issued_token_id;
end;
$$;

create or replace function pathways.is_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles
      on roles.user_id = accounts.id
    where accounts.id = auth.uid()
      and accounts.status = 'active'
      and roles.role in ('pathway_manager', 'admin')
  );
$$;

create or replace function pathways.require_manager()
returns uuid
language plpgsql
stable
security definer
set search_path = pg_catalog, core, pathways
as $$
declare
  actor_id uuid := auth.uid();
begin
  if actor_id is null or not pathways.is_manager() then
    raise exception 'Pathway manager access required'
      using errcode = '42501';
  end if;

  return actor_id;
end;
$$;

create or replace function pathways.version_is_active_published(target_version_id uuid)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, pathways
as $$
  select exists (
    select 1
    from pathways.maps as pathway_map
    join pathways.map_versions as version
      on version.id = pathway_map.active_version_id
    where version.id = target_version_id
      and version.map_id = pathway_map.id
      and version.status = 'published'
  );
$$;

create or replace function pathways.guard_version_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog, pathways
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Published and archived pathway versions are immutable';
    end if;
    return old;
  end if;

  if old.status = 'archived' then
    raise exception 'Archived pathway versions are immutable';
  end if;

  if old.status = 'published' then
    if new.status <> 'archived'
      or new.map_id is distinct from old.map_id
      or new.version_number is distinct from old.version_number
      or new.name is distinct from old.name
      or new.introduction is distinct from old.introduction
      or new.explorer_title is distinct from old.explorer_title
      or new.explorer_description is distinct from old.explorer_description
      or new.footer_note is distinct from old.footer_note
      or new.created_by is distinct from old.created_by
      or new.published_by is distinct from old.published_by
      or new.published_at is distinct from old.published_at
      or new.created_at is distinct from old.created_at
    then
      raise exception 'Published pathway versions may only be archived';
    end if;
  end if;

  return new;
end;
$$;

create trigger map_versions_guard_mutation
before update or delete on pathways.map_versions
for each row execute function pathways.guard_version_mutation();

create or replace function pathways.guard_child_mutation()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pathways
as $$
declare
  parent_version_id uuid;
  parent_status pathways.version_status;
begin
  if tg_table_name = 'stage_roles' then
    select stage.version_id
      into parent_version_id
    from pathways.stages as stage
    where stage.id = case
      when tg_op = 'DELETE' then old.stage_id
      else new.stage_id
    end;
  else
    parent_version_id := case
      when tg_op = 'DELETE' then old.version_id
      else new.version_id
    end;
  end if;

  select version.status
    into parent_status
  from pathways.map_versions as version
  where version.id = parent_version_id;

  if parent_status is distinct from 'draft'::pathways.version_status then
    raise exception 'Only draft pathway versions may be changed';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

create trigger phases_guard_mutation
before insert or update or delete on pathways.phases
for each row execute function pathways.guard_child_mutation();

create trigger tracks_guard_mutation
before insert or update or delete on pathways.tracks
for each row execute function pathways.guard_child_mutation();

create trigger stages_guard_mutation
before insert or update or delete on pathways.stages
for each row execute function pathways.guard_child_mutation();

create trigger stage_roles_guard_mutation
before insert or update or delete on pathways.stage_roles
for each row execute function pathways.guard_child_mutation();

create or replace function pathways.validate_active_version()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, pathways
as $$
begin
  if new.active_version_id is null then
    return new;
  end if;

  if not exists (
    select 1
    from pathways.map_versions as version
    where version.id = new.active_version_id
      and version.map_id = new.id
      and version.status = 'published'
  ) then
    raise exception 'Active pathway version must be a published version of the same map';
  end if;

  return new;
end;
$$;

create trigger maps_validate_active_version
before insert or update of active_version_id on pathways.maps
for each row execute function pathways.validate_active_version();

create or replace function pathways.audit_version_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, audit, pathways
as $$
declare
  action_name text;
begin
  if tg_op = 'INSERT' then
    action_name := 'pathway.version.created';
  elsif new.status = 'published' and old.status = 'draft' then
    action_name := 'pathway.version.published';
  elsif new.status = 'archived' and old.status = 'published' then
    action_name := 'pathway.version.archived';
  else
    action_name := 'pathway.version.updated';
  end if;

  insert into audit.events (
    actor_user_id,
    action,
    target_type,
    target_id,
    metadata
  ) values (
    auth.uid(),
    action_name,
    'pathway_version',
    new.id::text,
    jsonb_build_object(
      'map_id', new.map_id,
      'version_number', new.version_number,
      'status', new.status
    )
  );

  return new;
end;
$$;

create trigger map_versions_audit_change
after insert or update on pathways.map_versions
for each row execute function pathways.audit_version_change();

create or replace function pathways.create_draft_from_active(target_map_id uuid)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, pathways
as $$
declare
  actor_id uuid := pathways.require_manager();
  active_id uuid;
  draft_id uuid;
  next_version integer;
begin
  select pathway_map.active_version_id
    into active_id
  from pathways.maps as pathway_map
  where pathway_map.id = target_map_id
  for update;

  if not found then
    raise exception 'Pathway map was not found';
  end if;

  select version.id
    into draft_id
  from pathways.map_versions as version
  where version.map_id = target_map_id
    and version.status = 'draft'
  order by version.version_number desc
  limit 1;

  if draft_id is not null then
    return draft_id;
  end if;

  if active_id is null then
    raise exception 'A published pathway version is required before creating a draft';
  end if;

  select coalesce(max(version.version_number), 0) + 1
    into next_version
  from pathways.map_versions as version
  where version.map_id = target_map_id;

  insert into pathways.map_versions (
    map_id,
    version_number,
    status,
    name,
    introduction,
    explorer_title,
    explorer_description,
    footer_note,
    created_by
  )
  select
    target_map_id,
    next_version,
    'draft',
    active.name,
    active.introduction,
    active.explorer_title,
    active.explorer_description,
    active.footer_note,
    actor_id
  from pathways.map_versions as active
  where active.id = active_id
  returning id into draft_id;

  insert into pathways.phases (
    version_id,
    stable_key,
    name,
    description,
    sort_order
  )
  select
    draft_id,
    phase.stable_key,
    phase.name,
    phase.description,
    phase.sort_order
  from pathways.phases as phase
  where phase.version_id = active_id;

  insert into pathways.tracks (
    version_id,
    stable_key,
    name,
    short_name,
    description,
    color_token,
    sort_order
  )
  select
    draft_id,
    track.stable_key,
    track.name,
    track.short_name,
    track.description,
    track.color_token,
    track.sort_order
  from pathways.tracks as track
  where track.version_id = active_id;

  insert into pathways.stages (
    version_id,
    track_id,
    phase_id,
    stable_key,
    title,
    description,
    is_active
  )
  select
    draft_id,
    new_track.id,
    new_phase.id,
    stage.stable_key,
    stage.title,
    stage.description,
    stage.is_active
  from pathways.stages as stage
  join pathways.tracks as old_track
    on old_track.id = stage.track_id
  join pathways.phases as old_phase
    on old_phase.id = stage.phase_id
  join pathways.tracks as new_track
    on new_track.version_id = draft_id
    and new_track.stable_key = old_track.stable_key
  join pathways.phases as new_phase
    on new_phase.version_id = draft_id
    and new_phase.stable_key = old_phase.stable_key
  where stage.version_id = active_id;

  insert into pathways.stage_roles (
    stage_id,
    stable_key,
    name,
    sort_order
  )
  select
    new_stage.id,
    role.stable_key,
    role.name,
    role.sort_order
  from pathways.stage_roles as role
  join pathways.stages as old_stage
    on old_stage.id = role.stage_id
  join pathways.stages as new_stage
    on new_stage.version_id = draft_id
    and new_stage.stable_key = old_stage.stable_key
  where old_stage.version_id = active_id;

  return draft_id;
end;
$$;

create or replace function pathways.save_draft(
  draft_version_id uuid,
  payload jsonb
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pathways
as $$
declare
  actor_id uuid := pathways.require_manager();
  track_record record;
  phase_record record;
  stage_record record;
  role_record record;
  target_stage_id uuid;
  affected integer;
begin
  if jsonb_typeof(payload) <> 'object'
    or jsonb_typeof(payload -> 'phases') <> 'array'
    or jsonb_typeof(payload -> 'tracks') <> 'array'
    or jsonb_typeof(payload -> 'stages') <> 'array'
  then
    raise exception 'Invalid pathway draft payload';
  end if;

  if jsonb_array_length(payload -> 'phases') <> 5
    or jsonb_array_length(payload -> 'tracks') <> 4
    or jsonb_array_length(payload -> 'stages') <> 20
  then
    raise exception 'Pathway drafts require 5 phases, 4 tracks, and 20 stages';
  end if;

  if exists (
    select 1
    from unnest(array['explore', 'contribute', 'specialise', 'lead', 'champion'])
      as expected(stable_key)
    where (
      select count(*)
      from jsonb_array_elements(payload -> 'phases') as phase_item
      where phase_item ->> 'stable_key' = expected.stable_key
    ) <> 1
  ) or exists (
    select 1
    from jsonb_array_elements(payload -> 'phases') as phase_item
    where phase_item ->> 'stable_key' not in (
      'explore', 'contribute', 'specialise', 'lead', 'champion'
    )
  ) then
    raise exception 'Pathway phase keys are incomplete or duplicated';
  end if;

  if exists (
    select 1
    from unnest(array['mentor', 'educator', 'connector', 'professional'])
      as expected(stable_key)
    where (
      select count(*)
      from jsonb_array_elements(payload -> 'tracks') as track_item
      where track_item ->> 'stable_key' = expected.stable_key
    ) <> 1
  ) or exists (
    select 1
    from jsonb_array_elements(payload -> 'tracks') as track_item
    where track_item ->> 'stable_key' not in (
      'mentor', 'educator', 'connector', 'professional'
    )
  ) then
    raise exception 'Pathway track keys are incomplete or duplicated';
  end if;

  if exists (
    select 1
    from unnest(array['mentor', 'educator', 'connector', 'professional'])
      as expected_track(stable_key)
    cross join unnest(array['explore', 'contribute', 'specialise', 'lead', 'champion'])
      as expected_phase(stable_key)
    where (
      select count(*)
      from jsonb_array_elements(payload -> 'stages') as stage_item
      where stage_item ->> 'stable_key' =
        expected_track.stable_key || '.' || expected_phase.stable_key
        and stage_item ->> 'track_key' = expected_track.stable_key
        and stage_item ->> 'phase_key' = expected_phase.stable_key
    ) <> 1
  ) then
    raise exception 'Pathway stage keys are incomplete, duplicated, or mismatched';
  end if;

  update pathways.map_versions
  set
    name = trim(payload ->> 'name'),
    introduction = trim(payload ->> 'introduction'),
    explorer_title = trim(payload ->> 'explorerTitle'),
    explorer_description = trim(payload ->> 'explorerDescription'),
    footer_note = trim(payload ->> 'footerNote'),
    created_by = coalesce(created_by, actor_id)
  where id = draft_version_id
    and status = 'draft';

  get diagnostics affected = row_count;
  if affected <> 1 then
    raise exception 'Draft pathway version was not found';
  end if;

  for phase_record in
    select *
    from jsonb_to_recordset(payload -> 'phases') as phase_data(
      stable_key text,
      name text,
      description text,
      sort_order smallint
    )
  loop
    update pathways.phases
    set
      name = trim(phase_record.name),
      description = trim(phase_record.description),
      sort_order = phase_record.sort_order
    where version_id = draft_version_id
      and stable_key = phase_record.stable_key;

    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Unknown pathway phase key: %', phase_record.stable_key;
    end if;
  end loop;

  for track_record in
    select *
    from jsonb_to_recordset(payload -> 'tracks') as track_data(
      stable_key text,
      name text,
      short_name text,
      description text,
      color_token text,
      sort_order smallint
    )
  loop
    update pathways.tracks
    set
      name = trim(track_record.name),
      short_name = trim(track_record.short_name),
      description = trim(track_record.description),
      color_token = track_record.color_token,
      sort_order = track_record.sort_order
    where version_id = draft_version_id
      and stable_key = track_record.stable_key;

    get diagnostics affected = row_count;
    if affected <> 1 then
      raise exception 'Unknown pathway track key: %', track_record.stable_key;
    end if;
  end loop;

  for stage_record in
    select *
    from jsonb_to_recordset(payload -> 'stages') as stage_data(
      stable_key text,
      track_key text,
      phase_key text,
      title text,
      description text,
      roles jsonb
    )
  loop
    if jsonb_typeof(stage_record.roles) <> 'array'
      or jsonb_array_length(stage_record.roles) < 1
      or jsonb_array_length(stage_record.roles) > 3
    then
      raise exception 'Each pathway stage requires between 1 and 3 role options';
    end if;

    update pathways.stages as stage
    set
      title = trim(stage_record.title),
      description = trim(stage_record.description),
      is_active = true
    from pathways.tracks as track,
      pathways.phases as phase
    where stage.version_id = draft_version_id
      and stage.stable_key = stage_record.stable_key
      and track.id = stage.track_id
      and track.version_id = stage.version_id
      and track.stable_key = stage_record.track_key
      and phase.id = stage.phase_id
      and phase.version_id = stage.version_id
      and phase.stable_key = stage_record.phase_key
    returning stage.id into target_stage_id;

    if target_stage_id is null then
      raise exception 'Unknown pathway stage key: %', stage_record.stable_key;
    end if;

    delete from pathways.stage_roles
    where stage_roles.stage_id = target_stage_id;

    for role_record in
      select *
      from jsonb_to_recordset(stage_record.roles) as role_data(
        stable_key text,
        name text,
        sort_order smallint
      )
    loop
      if role_record.sort_order not between 1 and jsonb_array_length(stage_record.roles)
        or role_record.stable_key <> 'option-' || role_record.sort_order
      then
        raise exception 'Pathway role option keys and ordering are invalid';
      end if;

      insert into pathways.stage_roles (
        stage_id,
        stable_key,
        name,
        sort_order
      ) values (
        target_stage_id,
        role_record.stable_key,
        trim(role_record.name),
        role_record.sort_order
      );
    end loop;

    target_stage_id := null;
  end loop;
end;
$$;

create or replace function pathways.publish_draft(draft_version_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pathways
as $$
declare
  actor_id uuid := pathways.require_manager();
  target_map_id uuid;
  previous_active_id uuid;
  phase_count integer;
  track_count integer;
  stage_count integer;
  role_gap_count integer;
begin
  select version.map_id
    into target_map_id
  from pathways.map_versions as version
  where version.id = draft_version_id
    and version.status = 'draft'
  for update;

  if target_map_id is null then
    raise exception 'Draft pathway version was not found';
  end if;

  select count(*) into phase_count
  from pathways.phases
  where version_id = draft_version_id;

  select count(*) into track_count
  from pathways.tracks
  where version_id = draft_version_id;

  select count(*) into stage_count
  from pathways.stages
  where version_id = draft_version_id
    and is_active;

  select count(*) into role_gap_count
  from pathways.stages as stage
  where stage.version_id = draft_version_id
    and stage.is_active
    and not exists (
      select 1
      from pathways.stage_roles as role
      where role.stage_id = stage.id
    );

  if phase_count <> 5
    or track_count <> 4
    or stage_count <> 20
    or role_gap_count <> 0
  then
    raise exception 'Pathway draft is incomplete and cannot be published';
  end if;

  if exists (
    select 1
    from pathways.tracks as track
    cross join pathways.phases as phase
    where track.version_id = draft_version_id
      and phase.version_id = draft_version_id
      and not exists (
        select 1
        from pathways.stages as stage
        where stage.version_id = draft_version_id
          and stage.track_id = track.id
          and stage.phase_id = phase.id
          and stage.is_active
      )
  ) then
    raise exception 'Every track and phase combination requires an active stage';
  end if;

  select pathway_map.active_version_id
    into previous_active_id
  from pathways.maps as pathway_map
  where pathway_map.id = target_map_id
  for update;

  update pathways.map_versions
  set
    status = 'published',
    published_by = actor_id,
    published_at = now()
  where id = draft_version_id;

  update pathways.maps
  set active_version_id = draft_version_id
  where id = target_map_id;

  if previous_active_id is not null and previous_active_id <> draft_version_id then
    update pathways.map_versions
    set status = 'archived'
    where id = previous_active_id
      and status = 'published';
  end if;
end;
$$;

alter table pathways.maps enable row level security;
alter table pathways.maps force row level security;
alter table pathways.map_versions enable row level security;
alter table pathways.map_versions force row level security;
alter table pathways.phases enable row level security;
alter table pathways.phases force row level security;
alter table pathways.tracks enable row level security;
alter table pathways.tracks force row level security;
alter table pathways.stages enable row level security;
alter table pathways.stages force row level security;
alter table pathways.stage_roles enable row level security;
alter table pathways.stage_roles force row level security;

create policy maps_select_published_or_manager
on pathways.maps
for select
to anon, authenticated
using (
  active_version_id is not null
  or (select pathways.is_manager())
);

create policy map_versions_select_published_or_manager
on pathways.map_versions
for select
to anon, authenticated
using (
  (select pathways.version_is_active_published(id))
  or (select pathways.is_manager())
);

create policy phases_select_published_or_manager
on pathways.phases
for select
to anon, authenticated
using (
  (select pathways.version_is_active_published(version_id))
  or (select pathways.is_manager())
);

create policy tracks_select_published_or_manager
on pathways.tracks
for select
to anon, authenticated
using (
  (select pathways.version_is_active_published(version_id))
  or (select pathways.is_manager())
);

create policy stages_select_published_or_manager
on pathways.stages
for select
to anon, authenticated
using (
  (select pathways.version_is_active_published(version_id))
  or (select pathways.is_manager())
);

create policy stage_roles_select_published_or_manager
on pathways.stage_roles
for select
to anon, authenticated
using (
  exists (
    select 1
    from pathways.stages as stage
    where stage.id = stage_id
      and (
        (select pathways.version_is_active_published(stage.version_id))
        or (select pathways.is_manager())
      )
  )
);

revoke all on all tables in schema pathways from anon, authenticated;
revoke all on all sequences in schema pathways from anon, authenticated;
revoke all on all functions in schema pathways from public, anon, authenticated;

grant select on pathways.maps to anon, authenticated;
grant select on pathways.map_versions to anon, authenticated;
grant select on pathways.phases to anon, authenticated;
grant select on pathways.tracks to anon, authenticated;
grant select on pathways.stages to anon, authenticated;
grant select on pathways.stage_roles to anon, authenticated;

grant execute on function pathways.is_manager() to authenticated;
grant execute on function pathways.version_is_active_published(uuid) to anon, authenticated;
grant execute on function pathways.create_draft_from_active(uuid) to authenticated;
grant execute on function pathways.save_draft(uuid, jsonb) to authenticated;
grant execute on function pathways.publish_draft(uuid) to authenticated;

grant all on all tables in schema pathways to service_role;
grant all on all sequences in schema pathways to service_role;
grant execute on all functions in schema pathways to service_role;

alter default privileges in schema pathways
  revoke all on tables from anon, authenticated;
alter default privileges in schema pathways
  revoke all on sequences from anon, authenticated;
alter default privileges in schema pathways
  revoke execute on functions from public, anon, authenticated;

do $$
declare
  pathway_map_id uuid;
  published_version_id uuid;
begin
  insert into pathways.maps (slug)
  values ('volunteer-pathways')
  returning id into pathway_map_id;

  insert into pathways.map_versions (
    map_id,
    version_number,
    status,
    name,
    introduction,
    explorer_title,
    explorer_description,
    footer_note,
    created_by
  ) values (
    pathway_map_id,
    1,
    'draft',
    'My Volunteer Pathways',
    'Every volunteer starts as an Explorer. Discover four directions, understand the roles ahead, and imagine your next contribution.',
    'Explorer',
    'Discover where your strengths can take you.',
    'Pathway roles describe potential development, not guaranteed appointments.',
    null
  )
  returning id into published_version_id;

  insert into pathways.phases (
    version_id,
    stable_key,
    name,
    description,
    sort_order
  ) values
    (published_version_id, 'explore', 'Explore', 'Try a role, attend a briefing, and learn how you prefer to contribute.', 1),
    (published_version_id, 'contribute', 'Contribute', 'Take on a regular volunteer role and build practical experience.', 2),
    (published_version_id, 'specialise', 'Specialise', 'Develop deeper programme, facilitation, mentoring, or professional capability.', 3),
    (published_version_id, 'lead', 'Lead', 'Guide volunteers, coordinate delivery, and strengthen programme quality.', 4),
    (published_version_id, 'champion', 'Champion', 'Represent the pathway, advocate for volunteering, and shape future practice.', 5);

  insert into pathways.tracks (
    version_id,
    stable_key,
    name,
    short_name,
    description,
    color_token,
    sort_order
  ) values
    (published_version_id, 'mentor', 'Mentor', 'Mentor', 'Support learners and volunteers through sustained guidance and coaching.', 'green', 1),
    (published_version_id, 'educator', 'Educator & Facilitator', 'Educator', 'Create engaging learning experiences and facilitate useful conversations.', 'purple', 2),
    (published_version_id, 'connector', 'Community Connector', 'Connector', 'Build trust, strengthen relationships, and connect people with support.', 'teal', 3),
    (published_version_id, 'professional', 'Professional & Skills', 'Professional', 'Contribute professional knowledge, career guidance, and sector expertise.', 'yellow', 4);

  insert into pathways.stages (
    version_id,
    track_id,
    phase_id,
    stable_key,
    title,
    description,
    is_active
  )
  select
    published_version_id,
    track.id,
    phase.id,
    seed.stable_key,
    seed.title,
    seed.description,
    true
  from (values
    ('mentor.explore', 'mentor', 'explore', 'Briefing / Taster', 'Attend a briefing or taster experience to understand mentoring expectations.'),
    ('mentor.contribute', 'mentor', 'contribute', 'STARS / Flash Mentor', 'Contribute directly through a structured or short-format mentoring role.'),
    ('mentor.specialise', 'mentor', 'specialise', 'Senior / Specialised Mentor', 'Apply deeper experience with learners who need sustained or specialised support.'),
    ('mentor.lead', 'mentor', 'lead', 'Lead Mentor / Mentor Coach', 'Guide other mentors, support quality, and strengthen delivery practice.'),
    ('mentor.champion', 'mentor', 'champion', 'Mentoring Ambassador', 'Advocate for mentoring and help grow a strong mentoring community.'),
    ('educator.explore', 'educator', 'explore', 'Observe / Support a session', 'Observe or support a learning session before taking on facilitation responsibility.'),
    ('educator.contribute', 'educator', 'contribute', 'RSL Facilitator / Langkah Digital Ambassador', 'Facilitate established learning experiences with programme guidance.'),
    ('educator.specialise', 'educator', 'specialise', 'Lead Facilitator / AI-Digital Trainer', 'Lead sessions and apply specialised digital or learning expertise.'),
    ('educator.lead', 'educator', 'lead', 'Master Facilitator / Training Lead', 'Develop facilitators, coordinate training, and strengthen learning quality.'),
    ('educator.champion', 'educator', 'champion', 'Learning Ambassador', 'Champion accessible learning and represent the facilitator community.'),
    ('connector.explore', 'connector', 'explore', 'Event / Outreach Volunteer', 'Meet the community through events, outreach, and introductory engagement.'),
    ('connector.contribute', 'connector', 'contribute', 'Befriender / PLAY Ambassador', 'Build consistent relationships and connect participants with programme support.'),
    ('connector.specialise', 'connector', 'specialise', 'Senior Befriender / Programme Facilitator', 'Take on complex engagement and facilitate community-based programme activity.'),
    ('connector.lead', 'connector', 'lead', 'Team / Cluster Lead', 'Coordinate volunteer teams or local clusters and support consistent delivery.'),
    ('connector.champion', 'connector', 'champion', 'Community Champion', 'Represent community needs and mobilise others around meaningful action.'),
    ('professional.explore', 'professional', 'explore', 'PN Event Participant', 'Join a professional network event and explore where your expertise could help.'),
    ('professional.contribute', 'professional', 'contribute', 'Volunteer', 'Contribute professional time or skills to a defined volunteer need.'),
    ('professional.specialise', 'professional', 'specialise', 'Career Mentor / Skills Coach / Speaker', 'Apply specialist experience through career guidance, coaching, or speaking.'),
    ('professional.lead', 'professional', 'lead', 'PN Core Team / Mclub Exco', 'Shape professional-network activity and coordinate sector-based contributions.'),
    ('professional.champion', 'professional', 'champion', 'Sector Leaders', 'Mobilise sector expertise and advocate for sustained professional contribution.')
  ) as seed(stable_key, track_key, phase_key, title, description)
  join pathways.tracks as track
    on track.version_id = published_version_id
    and track.stable_key = seed.track_key
  join pathways.phases as phase
    on phase.version_id = published_version_id
    and phase.stable_key = seed.phase_key;

  insert into pathways.stage_roles (
    stage_id,
    stable_key,
    name,
    sort_order
  )
  select
    stage.id,
    'option-' || role_option.ordinality,
    role_option.name,
    role_option.ordinality
  from (values
    ('mentor.explore', array['Briefing', 'Taster']),
    ('mentor.contribute', array['STARS', 'Flash Mentor']),
    ('mentor.specialise', array['Senior Mentor', 'Specialised Mentor']),
    ('mentor.lead', array['Lead Mentor', 'Mentor Coach']),
    ('mentor.champion', array['Mentoring Ambassador']),
    ('educator.explore', array['Observe a session', 'Support a session']),
    ('educator.contribute', array['RSL Facilitator', 'Langkah Digital Ambassador']),
    ('educator.specialise', array['Lead Facilitator', 'AI-Digital Trainer']),
    ('educator.lead', array['Master Facilitator', 'Training Lead']),
    ('educator.champion', array['Learning Ambassador']),
    ('connector.explore', array['Event Volunteer', 'Outreach Volunteer']),
    ('connector.contribute', array['Befriender', 'PLAY Ambassador']),
    ('connector.specialise', array['Senior Befriender', 'Programme Facilitator']),
    ('connector.lead', array['Team Lead', 'Cluster Lead']),
    ('connector.champion', array['Community Champion']),
    ('professional.explore', array['PN Event Participant']),
    ('professional.contribute', array['Volunteer']),
    ('professional.specialise', array['Career Mentor', 'Skills Coach', 'Speaker']),
    ('professional.lead', array['PN Core Team', 'Mclub Exco']),
    ('professional.champion', array['Sector Leaders'])
  ) as role_seed(stage_key, roles)
  join pathways.stages as stage
    on stage.version_id = published_version_id
    and stage.stable_key = role_seed.stage_key
  cross join lateral unnest(role_seed.roles) with ordinality
    as role_option(name, ordinality);

  update pathways.map_versions
  set
    status = 'published',
    published_at = now()
  where id = published_version_id;

  update pathways.maps
  set active_version_id = published_version_id
  where id = pathway_map_id;
end;
$$;

-- The production project already manages its exposed schemas through the
-- authenticator role. Keep that explicit configuration in sync so the
-- pathways schema is immediately available to supabase-js/PostgREST.
alter role authenticator set pgrst.db_schemas =
  'public, graphql_public, content, core, ymhub, pathways';
notify pgrst, 'reload config';

commit;
