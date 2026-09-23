begin;

drop policy if exists volunteer_positions_select_self_or_manager
on pathways.volunteer_positions;

create policy volunteer_positions_select_self
on pathways.volunteer_positions
for select
to authenticated
using (
  exists (
    select 1
    from core.volunteers as volunteers
    where volunteers.id = volunteer_id
      and volunteers.auth_user_id = (select auth.uid())
      and (select core.is_current_account_active())
  )
);

comment on policy volunteer_positions_select_self
on pathways.volunteer_positions is
  'Personal pathway-position reads are limited to the signed-in volunteer. Staff administration uses role-gated server actions and service-role reads.';

revoke select on pathways.volunteer_positions from authenticated;

create or replace function core.get_current_pathway_positions_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, core, pathways
as $$
declare
  current_user_id uuid := auth.uid();
  current_volunteer_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    return jsonb_build_object('linked', false, 'positions', '[]'::jsonb);
  end if;

  select volunteers.id
  into current_volunteer_id
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  limit 1;

  if current_volunteer_id is null then
    return jsonb_build_object('linked', false, 'positions', '[]'::jsonb);
  end if;

  return jsonb_build_object(
    'linked', true,
    'positions', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', positions.id,
          'map_id', positions.map_id,
          'track_stable_key', positions.track_stable_key,
          'stage_stable_key', positions.stage_stable_key,
          'track_name_snapshot', positions.track_name_snapshot,
          'stage_title_snapshot', positions.stage_title_snapshot,
          'effective_from', positions.effective_from
        )
        order by positions.effective_from desc, positions.track_name_snapshot
      )
      from pathways.volunteer_positions as positions
      where positions.volunteer_id = current_volunteer_id
        and positions.ended_at is null
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function core.get_current_pathway_positions_snapshot()
  from public, anon, authenticated;
grant execute on function core.get_current_pathway_positions_snapshot()
  to authenticated, service_role;

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

revoke all on function core.get_current_badges_snapshot()
  from public, anon, authenticated;
grant execute on function core.get_current_badges_snapshot()
  to authenticated, service_role;

create index if not exists badge_definitions_created_by_idx
  on gamification.badge_definitions (created_by);

create index if not exists volunteer_badges_badge_id_idx
  on gamification.volunteer_badges (badge_id);

create index if not exists volunteer_badges_awarded_by_idx
  on gamification.volunteer_badges (awarded_by);

create index if not exists volunteer_badges_revoked_by_idx
  on gamification.volunteer_badges (revoked_by);

create index if not exists volunteer_positions_map_id_idx
  on pathways.volunteer_positions (map_id);

create index if not exists volunteer_positions_assigned_version_id_idx
  on pathways.volunteer_positions (assigned_version_id);

create index if not exists volunteer_positions_assigned_by_idx
  on pathways.volunteer_positions (assigned_by);

create index if not exists volunteer_positions_ended_by_idx
  on pathways.volunteer_positions (ended_by);

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
  previous_stage_key text;
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

  select positions.id, positions.stage_stable_key
  into previous_position_id, previous_stage_key
  from pathways.volunteer_positions as positions
  where positions.volunteer_id = p_volunteer_id
    and positions.map_id = current_map_id
    and positions.track_stable_key = current_track_key
    and positions.ended_at is null
  for update;

  if previous_position_id is not null
     and previous_stage_key = current_stage_key then
    return previous_position_id;
  end if;

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

commit;
