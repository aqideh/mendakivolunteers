begin;

create table gamification.badge_definitions (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null unique check (
    stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(stable_key) between 3 and 100
  ),
  name text not null check (char_length(name) between 2 and 120),
  description text not null check (char_length(description) between 10 and 500),
  created_by uuid references core.user_accounts (id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table gamification.badge_definitions is
  'Staff-defined KELUARGA recognition badges. Badge definitions do not imply automatic earning criteria.';

create table gamification.volunteer_badges (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers (id) on delete restrict,
  badge_id uuid not null references gamification.badge_definitions (id) on delete restrict,
  reason text not null check (char_length(reason) between 5 and 500),
  request_id uuid not null unique,
  awarded_by uuid references core.user_accounts (id) on delete set null,
  awarded_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by uuid references core.user_accounts (id) on delete set null,
  revocation_reason text,
  constraint volunteer_badges_revocation_consistency check (
    (revoked_at is null and revoked_by is null and revocation_reason is null)
    or (
      revoked_at is not null
      and revocation_reason is not null
      and char_length(revocation_reason) between 5 and 500
    )
  )
);

comment on table gamification.volunteer_badges is
  'Audited manual badge awards. Corrections revoke an award without deleting its history.';

create unique index volunteer_badges_one_active_idx
  on gamification.volunteer_badges (volunteer_id, badge_id)
  where revoked_at is null;

create index volunteer_badges_volunteer_awarded_idx
  on gamification.volunteer_badges (volunteer_id, awarded_at desc);

alter table gamification.badge_definitions enable row level security;
alter table gamification.badge_definitions force row level security;
alter table gamification.volunteer_badges enable row level security;
alter table gamification.volunteer_badges force row level security;

revoke all on gamification.badge_definitions from public, anon, authenticated;
revoke all on gamification.volunteer_badges from public, anon, authenticated;
grant all on gamification.badge_definitions to service_role;
grant all on gamification.volunteer_badges to service_role;

create or replace function core.create_badge_definition(
  p_stable_key text,
  p_name text,
  p_description text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, gamification, audit
as $$
declare
  current_user_id uuid := auth.uid();
  clean_key text := lower(nullif(btrim(p_stable_key), ''));
  clean_name text := nullif(btrim(p_name), '');
  clean_description text := nullif(btrim(p_description), '');
  badge_id uuid;
begin
  if current_user_id is null
     or not core.is_current_account_active()
     or not (
       core.has_role('gamification_manager'::core.app_role)
       or core.has_role('admin'::core.app_role)
     ) then
    raise exception 'Gamification management permission is required'
      using errcode = '42501';
  end if;

  if clean_key is null
     or clean_key !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
     or char_length(clean_key) not between 3 and 100 then
    raise exception 'Badge key is invalid' using errcode = '22023';
  end if;

  if clean_name is null or char_length(clean_name) not between 2 and 120 then
    raise exception 'Badge name is invalid' using errcode = '22023';
  end if;

  if clean_description is null
     or char_length(clean_description) not between 10 and 500 then
    raise exception 'Badge description is invalid' using errcode = '22023';
  end if;

  insert into gamification.badge_definitions (
    stable_key,
    name,
    description,
    created_by
  )
  values (
    clean_key,
    clean_name,
    clean_description,
    current_user_id
  )
  returning id into badge_id;

  perform audit.write_event(
    'gamification.badge_definition_created',
    'badge_definition',
    badge_id::text,
    jsonb_build_object('stable_key', clean_key, 'name', clean_name),
    current_user_id,
    null
  );

  return badge_id;
end;
$$;

create or replace function core.award_badge(
  p_volunteer_id uuid,
  p_badge_id uuid,
  p_reason text,
  p_request_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, gamification, audit
as $$
declare
  current_user_id uuid := auth.uid();
  clean_reason text := nullif(btrim(p_reason), '');
  existing_id uuid;
  existing_volunteer_id uuid;
  existing_badge_id uuid;
  existing_reason text;
  badge_name text;
  award_id uuid;
begin
  if current_user_id is null
     or not core.is_current_account_active()
     or not (
       core.has_role('gamification_manager'::core.app_role)
       or core.has_role('admin'::core.app_role)
     ) then
    raise exception 'Gamification management permission is required'
      using errcode = '42501';
  end if;

  if p_volunteer_id is null
     or not exists (select 1 from core.volunteers where id = p_volunteer_id) then
    raise exception 'Volunteer could not be found' using errcode = 'P0002';
  end if;

  select definitions.name
  into badge_name
  from gamification.badge_definitions as definitions
  where definitions.id = p_badge_id;

  if badge_name is null then
    raise exception 'Badge could not be found' using errcode = 'P0002';
  end if;

  if clean_reason is null or char_length(clean_reason) not between 5 and 500 then
    raise exception 'A badge-award reason between 5 and 500 characters is required'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'A request ID is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('badge-award:' || p_request_id::text, 0)
  );

  select
    awards.id,
    awards.volunteer_id,
    awards.badge_id,
    awards.reason
  into
    existing_id,
    existing_volunteer_id,
    existing_badge_id,
    existing_reason
  from gamification.volunteer_badges as awards
  where awards.request_id = p_request_id
  limit 1;

  if existing_id is not null then
    if existing_volunteer_id is distinct from p_volunteer_id
       or existing_badge_id is distinct from p_badge_id
       or existing_reason is distinct from clean_reason then
      raise exception 'Request ID has already been used for a different badge award'
        using errcode = '23505';
    end if;

    return existing_id;
  end if;

  if exists (
    select 1
    from gamification.volunteer_badges as awards
    where awards.volunteer_id = p_volunteer_id
      and awards.badge_id = p_badge_id
      and awards.revoked_at is null
  ) then
    raise exception 'Volunteer already has this active badge'
      using errcode = '23505';
  end if;

  insert into gamification.volunteer_badges (
    volunteer_id,
    badge_id,
    reason,
    request_id,
    awarded_by
  )
  values (
    p_volunteer_id,
    p_badge_id,
    clean_reason,
    p_request_id,
    current_user_id
  )
  returning id into award_id;

  perform audit.write_event(
    'gamification.badge_awarded',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'award_id', award_id,
      'badge_id', p_badge_id,
      'badge_name', badge_name,
      'reason', clean_reason
    ),
    current_user_id,
    p_request_id
  );

  return award_id;
end;
$$;

create or replace function core.revoke_badge(
  p_award_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, core, gamification, audit
as $$
declare
  current_user_id uuid := auth.uid();
  clean_reason text := nullif(btrim(p_reason), '');
  award_record gamification.volunteer_badges%rowtype;
begin
  if current_user_id is null
     or not core.is_current_account_active()
     or not (
       core.has_role('gamification_manager'::core.app_role)
       or core.has_role('admin'::core.app_role)
     ) then
    raise exception 'Gamification management permission is required'
      using errcode = '42501';
  end if;

  if clean_reason is null or char_length(clean_reason) not between 5 and 500 then
    raise exception 'A revocation reason between 5 and 500 characters is required'
      using errcode = '22023';
  end if;

  select *
  into award_record
  from gamification.volunteer_badges
  where id = p_award_id
  for update;

  if not found then
    raise exception 'Badge award could not be found' using errcode = 'P0002';
  end if;

  if award_record.revoked_at is not null then
    return;
  end if;

  update gamification.volunteer_badges
  set
    revoked_at = now(),
    revoked_by = current_user_id,
    revocation_reason = clean_reason
  where id = p_award_id;

  perform audit.write_event(
    'gamification.badge_revoked',
    'volunteer',
    award_record.volunteer_id::text,
    jsonb_build_object(
      'award_id', p_award_id,
      'badge_id', award_record.badge_id,
      'reason', clean_reason
    ),
    current_user_id,
    null
  );
end;
$$;

create or replace function core.get_current_badges_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, core, gamification
as $$
declare
  current_user_id uuid := auth.uid();
  current_volunteer_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    return jsonb_build_object('linked', false, 'badges', '[]'::jsonb);
  end if;

  select volunteers.id
  into current_volunteer_id
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  limit 1;

  if current_volunteer_id is null then
    return jsonb_build_object('linked', false, 'badges', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'linked', true,
    'badges', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'award_id', awards.id,
          'badge_id', definitions.id,
          'stable_key', definitions.stable_key,
          'name', definitions.name,
          'description', definitions.description,
          'reason', awards.reason,
          'awarded_at', awards.awarded_at
        )
        order by awards.awarded_at desc, definitions.name
      )
      from gamification.volunteer_badges as awards
      join gamification.badge_definitions as definitions
        on definitions.id = awards.badge_id
      where awards.volunteer_id = current_volunteer_id
        and awards.revoked_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function core.create_badge_definition(text, text, text)
  from public, anon, authenticated;
revoke all on function core.award_badge(uuid, uuid, text, uuid)
  from public, anon, authenticated;
revoke all on function core.revoke_badge(uuid, text)
  from public, anon, authenticated;
revoke all on function core.get_current_badges_snapshot()
  from public, anon, authenticated;

grant execute on function core.create_badge_definition(text, text, text)
  to authenticated, service_role;
grant execute on function core.award_badge(uuid, uuid, text, uuid)
  to authenticated, service_role;
grant execute on function core.revoke_badge(uuid, text)
  to authenticated, service_role;
grant execute on function core.get_current_badges_snapshot()
  to authenticated, service_role;

create table pathways.volunteer_positions (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers (id) on delete restrict,
  map_id uuid not null references pathways.maps (id) on delete restrict,
  assigned_version_id uuid not null references pathways.map_versions (id) on delete restrict,
  track_stable_key text not null check (
    track_stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'
    and char_length(track_stable_key) between 2 and 60
  ),
  stage_stable_key text not null check (
    stage_stable_key ~ '^[a-z0-9]+(?:[.-][a-z0-9]+)*$'
    and char_length(stage_stable_key) between 3 and 130
  ),
  track_name_snapshot text not null check (char_length(track_name_snapshot) between 2 and 100),
  stage_title_snapshot text not null check (char_length(stage_title_snapshot) between 2 and 180),
  reason text not null check (char_length(reason) between 5 and 500),
  notes text check (notes is null or char_length(notes) <= 1000),
  effective_from timestamptz not null default now(),
  ended_at timestamptz,
  assigned_by uuid references core.user_accounts (id) on delete set null,
  ended_by uuid references core.user_accounts (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint volunteer_positions_end_order check (
    ended_at is null or ended_at >= effective_from
  )
);

comment on table pathways.volunteer_positions is
  'Staff-managed pathway position history. One active position is allowed per volunteer and pathway track; progress is never automatic.';

create unique index volunteer_positions_one_active_track_idx
  on pathways.volunteer_positions (volunteer_id, map_id, track_stable_key)
  where ended_at is null;

create index volunteer_positions_volunteer_active_idx
  on pathways.volunteer_positions (volunteer_id, ended_at, effective_from desc);

alter table pathways.volunteer_positions enable row level security;
alter table pathways.volunteer_positions force row level security;

create policy volunteer_positions_select_self_or_manager
on pathways.volunteer_positions
for select
to authenticated
using (
  (select pathways.is_manager())
  or exists (
    select 1
    from core.volunteers as volunteers
    where volunteers.id = volunteer_id
      and volunteers.auth_user_id = (select auth.uid())
  )
);

revoke all on pathways.volunteer_positions from public, anon, authenticated;
grant select on pathways.volunteer_positions to authenticated;
grant all on pathways.volunteer_positions to service_role;

create or replace function pathways.assign_volunteer_position(
  p_volunteer_id uuid,
  p_stage_id uuid,
  p_reason text,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, pathways, audit
as $$
declare
  actor_id uuid := pathways.require_manager();
  clean_reason text := nullif(btrim(p_reason), '');
  clean_notes text := nullif(btrim(coalesce(p_notes, '')), '');
  current_map_id uuid;
  current_version_id uuid;
  current_track_key text;
  current_track_name text;
  current_stage_key text;
  current_stage_title text;
  previous_position_id uuid;
  new_position_id uuid;
begin
  if p_volunteer_id is null
     or not exists (select 1 from core.volunteers where id = p_volunteer_id) then
    raise exception 'Volunteer could not be found' using errcode = 'P0002';
  end if;

  if clean_reason is null or char_length(clean_reason) not between 5 and 500 then
    raise exception 'An assignment reason between 5 and 500 characters is required'
      using errcode = '22023';
  end if;

  if clean_notes is not null and char_length(clean_notes) > 1000 then
    raise exception 'Pathway notes cannot exceed 1000 characters'
      using errcode = '22023';
  end if;

  select
    pathway_map.id,
    version.id,
    track.stable_key,
    track.name,
    stage.stable_key,
    stage.title
  into
    current_map_id,
    current_version_id,
    current_track_key,
    current_track_name,
    current_stage_key,
    current_stage_title
  from pathways.stages as stage
  join pathways.tracks as track
    on track.id = stage.track_id
    and track.version_id = stage.version_id
  join pathways.map_versions as version
    on version.id = stage.version_id
  join pathways.maps as pathway_map
    on pathway_map.id = version.map_id
    and pathway_map.active_version_id = version.id
  where stage.id = p_stage_id
    and stage.is_active
    and version.status = 'published'
  limit 1;

  if current_stage_key is null then
    raise exception 'Pathway stage must belong to the active published map'
      using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'pathway-position:' || p_volunteer_id::text || ':' ||
      current_map_id::text || ':' || current_track_key,
      0
    )
  );

  select positions.id
  into previous_position_id
  from pathways.volunteer_positions as positions
  where positions.volunteer_id = p_volunteer_id
    and positions.map_id = current_map_id
    and positions.track_stable_key = current_track_key
    and positions.ended_at is null
  for update;

  if previous_position_id is not null then
    update pathways.volunteer_positions
    set
      ended_at = now(),
      ended_by = actor_id
    where id = previous_position_id;
  end if;

  insert into pathways.volunteer_positions (
    volunteer_id,
    map_id,
    assigned_version_id,
    track_stable_key,
    stage_stable_key,
    track_name_snapshot,
    stage_title_snapshot,
    reason,
    notes,
    assigned_by
  )
  values (
    p_volunteer_id,
    current_map_id,
    current_version_id,
    current_track_key,
    current_stage_key,
    current_track_name,
    current_stage_title,
    clean_reason,
    clean_notes,
    actor_id
  )
  returning id into new_position_id;

  perform audit.write_event(
    'pathway.position_assigned',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'position_id', new_position_id,
      'previous_position_id', previous_position_id,
      'map_id', current_map_id,
      'assigned_version_id', current_version_id,
      'track_stable_key', current_track_key,
      'stage_stable_key', current_stage_key,
      'reason', clean_reason
    ),
    actor_id,
    null
  );

  return new_position_id;
end;
$$;

create or replace function pathways.clear_volunteer_position(
  p_position_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, pathways, audit
as $$
declare
  actor_id uuid := pathways.require_manager();
  clean_reason text := nullif(btrim(p_reason), '');
  position_record pathways.volunteer_positions%rowtype;
begin
  if clean_reason is null or char_length(clean_reason) not between 5 and 500 then
    raise exception 'A clearing reason between 5 and 500 characters is required'
      using errcode = '22023';
  end if;

  select *
  into position_record
  from pathways.volunteer_positions
  where id = p_position_id
  for update;

  if not found then
    raise exception 'Pathway position could not be found' using errcode = 'P0002';
  end if;

  if position_record.ended_at is not null then
    return;
  end if;

  update pathways.volunteer_positions
  set
    ended_at = now(),
    ended_by = actor_id
  where id = p_position_id;

  perform audit.write_event(
    'pathway.position_cleared',
    'volunteer',
    position_record.volunteer_id::text,
    jsonb_build_object(
      'position_id', p_position_id,
      'track_stable_key', position_record.track_stable_key,
      'stage_stable_key', position_record.stage_stable_key,
      'reason', clean_reason
    ),
    actor_id,
    null
  );
end;
$$;

revoke all on function pathways.assign_volunteer_position(uuid, uuid, text, text)
  from public, anon, authenticated;
revoke all on function pathways.clear_volunteer_position(uuid, text)
  from public, anon, authenticated;
grant execute on function pathways.assign_volunteer_position(uuid, uuid, text, text)
  to authenticated, service_role;
grant execute on function pathways.clear_volunteer_position(uuid, text)
  to authenticated, service_role;

commit;
