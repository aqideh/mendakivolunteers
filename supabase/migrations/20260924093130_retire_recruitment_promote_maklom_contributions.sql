
revoke execute on function core.submit_keluarga_recruitment_application(text,text,text,text,text)
  from authenticated, service_role;
revoke execute on function core.withdraw_keluarga_recruitment_application(uuid)
  from authenticated, service_role;
revoke execute on function core.review_keluarga_recruitment_application(uuid,text,text,uuid)
  from service_role;

comment on function core.submit_keluarga_recruitment_application(text,text,text,text,text) is
  'Retired historical KELUARGA recruitment write path. New prospect intake is FormSG -> MakLom volunteer_leads.';
comment on function core.withdraw_keluarga_recruitment_application(uuid) is
  'Retired historical KELUARGA recruitment write path. Historical application rows remain for provenance.';
comment on function core.review_keluarga_recruitment_application(uuid,text,text,uuid) is
  'Retired historical KELUARGA recruitment review path. Lead review now belongs to MakLom.';

drop policy if exists volunteer_contributions_select_self_approved
  on public.volunteer_contributions;
create policy volunteer_contributions_select_self_approved
on public.volunteer_contributions
for select to authenticated
using (
  status = 'approved'
  and volunteer_id = (select core.current_volunteer_id())
);

comment on table public.keluarga_contribution_credits is
  'Legacy KELUARGA manual-event credit ledger retained for historical provenance. New attendance-derived hours flow through public.volunteer_contributions and require MakLom approval.';

revoke execute on function core.refresh_manual_event_contribution_credits(uuid,uuid)
  from service_role;
comment on function core.refresh_manual_event_contribution_credits(uuid,uuid) is
  'Retired legacy crediting path. New operational attendance flows to MakLom review in public.volunteer_contributions.';

create or replace function core.refresh_maklom_contribution_candidates(
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
  target_volunteer_id uuid;
  duration_minutes integer;
  candidate_count integer := 0;
  review_count integer := 0;
  skipped_count integer := 0;
  total_minutes integer := 0;
begin
  if not exists (
    select 1
    from core.user_accounts accounts
    join core.user_roles roles on roles.user_id = accounts.id
    where accounts.id = p_actor_user_id
      and accounts.status = 'active'
      and roles.role in ('volteam', 'admin')
  ) then
    raise exception 'Volunteer Team authorization is required'
      using errcode = '42501';
  end if;

  select *
  into event_record
  from public.phaseone_events
  where id = p_event_id
  for update;

  if not found then
    raise exception 'Event not found' using errcode = 'P0002';
  end if;

  if event_record.operations_scope <> 'manual_integrated'
     or not event_record.credit_contribution_hours then
    raise exception 'This manual event is not configured to submit contribution hours for review'
      using errcode = 'P0001';
  end if;

  for session_record in
    select *
    from public.phaseone_attendance_sessions
    where event_id = p_event_id
      and checked_in_at is not null
      and checked_out_at is not null
      and checked_out_at >= checked_in_at
    order by attendance_date, checked_in_at
  loop
    select roster.volunteer_id
    into target_volunteer_id
    from public.phaseone_roster roster
    where roster.id = session_record.origin_roster_id;

    if target_volunteer_id is null then
      skipped_count := skipped_count + 1;
      continue;
    end if;

    duration_minutes := greatest(
      floor(extract(epoch from (session_record.checked_out_at - session_record.checked_in_at)) / 60)::integer,
      0
    );

    insert into public.volunteer_contributions (
      volunteer_id,
      event_id,
      attendance_session_id,
      occurred_at,
      operational_minutes,
      status
    )
    values (
      target_volunteer_id,
      p_event_id,
      session_record.id,
      session_record.checked_out_at,
      duration_minutes,
      'pending'
    )
    on conflict (attendance_session_id) do update
    set
      volunteer_id = excluded.volunteer_id,
      event_id = excluded.event_id,
      occurred_at = excluded.occurred_at,
      status = case
        when public.volunteer_contributions.status = 'approved'
          and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
          then 'needs_review'
        when public.volunteer_contributions.status = 'rejected'
          then 'pending'
        else public.volunteer_contributions.status
      end,
      approved_at = case
        when public.volunteer_contributions.status = 'approved'
          and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
          then null
        else public.volunteer_contributions.approved_at
      end,
      approved_by = case
        when public.volunteer_contributions.status = 'approved'
          and public.volunteer_contributions.operational_minutes is distinct from excluded.operational_minutes
          then null
        else public.volunteer_contributions.approved_by
      end,
      operational_minutes = excluded.operational_minutes,
      updated_at = now();

    candidate_count := candidate_count + 1;
    total_minutes := total_minutes + duration_minutes;
  end loop;

  select count(*)
  into review_count
  from public.volunteer_contributions
  where event_id = p_event_id
    and status in ('pending', 'needs_review');

  return jsonb_build_object(
    'candidate_sessions', candidate_count,
    'review_sessions', review_count,
    'skipped_sessions', skipped_count,
    'total_operational_minutes', total_minutes
  );
end;
$$;

revoke all on function core.refresh_maklom_contribution_candidates(uuid,uuid)
  from public, anon, authenticated;
grant execute on function core.refresh_maklom_contribution_candidates(uuid,uuid)
  to service_role;

comment on function core.refresh_maklom_contribution_candidates(uuid,uuid) is
  'Refreshes KELUARGA operational attendance candidates for MakLom review. It never approves volunteer hours.';

