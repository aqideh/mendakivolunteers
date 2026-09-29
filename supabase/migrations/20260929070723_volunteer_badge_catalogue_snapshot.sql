begin;

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
    return jsonb_build_object(
      'linked', false,
      'badges', '[]'::jsonb,
      'catalogue', '[]'::jsonb
    );
  end if;

  select volunteers.id
  into current_volunteer_id
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  limit 1;

  if current_volunteer_id is null then
    return jsonb_build_object(
      'linked', false,
      'badges', '[]'::jsonb,
      'catalogue', '[]'::jsonb
    );
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
    ), '[]'::jsonb),
    'catalogue', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'badge_id', definitions.id,
          'stable_key', definitions.stable_key,
          'name', definitions.name,
          'description', definitions.description
        )
        order by definitions.created_at, definitions.name
      )
      from gamification.badge_definitions as definitions
    ), '[]'::jsonb)
  );
end;
$$;

revoke all on function core.get_current_badges_snapshot()
  from public, anon, authenticated;
grant execute on function core.get_current_badges_snapshot()
  to authenticated, service_role;

commit;
