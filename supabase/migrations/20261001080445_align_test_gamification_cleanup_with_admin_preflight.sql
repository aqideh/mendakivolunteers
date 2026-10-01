begin;

create or replace function core.purge_test_volunteer_gamification(
  p_volunteer_id uuid,
  p_actor_user_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, public, gamification, pathways, ymhub
as $$
declare
  v_points integer := 0;
  v_badges integer := 0;
begin
  if not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role = 'admin'
  ) then
    raise exception 'Administrator authorization is required'
      using errcode = '42501';
  end if;

  if not exists (select 1 from core.volunteers where id = p_volunteer_id) then
    raise exception 'Volunteer could not be found'
      using errcode = 'P0002';
  end if;

  -- Registration/recruitment rows are allowed here because the guarded admin
  -- cleanup removes those immediately afterwards. Retained operational history
  -- still blocks gamification cleanup.
  if exists (
    select 1 from public.volunteer_contributions where volunteer_id = p_volunteer_id
    union all
    select 1 from public.keluarga_contribution_credits where volunteer_id = p_volunteer_id
    union all
    select 1 from public.volunteer_shirt_issuances where volunteer_id = p_volunteer_id
    union all
    select 1 from pathways.volunteer_positions where volunteer_id = p_volunteer_id
    union all
    select 1 from ymhub.assignment_snapshots where volunteer_id = p_volunteer_id
    union all
    select 1 from ymhub.attendance_snapshots where volunteer_id = p_volunteer_id
    union all
    select 1 from ymhub.registration_snapshots where volunteer_id = p_volunteer_id
    union all
    select 1 from ymhub.volunteer_sync_status where volunteer_id = p_volunteer_id
    union all
    select 1 from public.historical_attendance_import_rows where matched_core_volunteer_id = p_volunteer_id
    union all
    select 1
    from public.phaseone_attendance attendance
    join public.phaseone_roster roster on roster.id = attendance.roster_id
    where roster.volunteer_id = p_volunteer_id
    limit 1
  ) then
    raise exception 'Volunteer has retained operational history'
      using errcode = 'P0001';
  end if;

  perform set_config('app.allow_test_volunteer_cleanup', 'on', true);

  delete from gamification.volunteer_badges
  where volunteer_id = p_volunteer_id;
  get diagnostics v_badges = row_count;

  delete from gamification.point_ledger_entries
  where volunteer_id = p_volunteer_id;
  get diagnostics v_points = row_count;

  return jsonb_build_object(
    'removed_point_entries', v_points,
    'removed_badges', v_badges
  );
end;
$$;

commit;
