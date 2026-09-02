begin;

create or replace function gamification.reconcile_verified_attendance_points(
  target_volunteer_id uuid default null
)
returns integer
language plpgsql
security definer
set search_path = pg_catalog, gamification, ymhub, core
as $$
declare
  source_row record;
  applicable_rule_id uuid;
  applicable_method gamification.point_calculation_method;
  applicable_value numeric(10, 2);
  current_points numeric(12, 2);
  expected_points numeric(12, 2);
  delta numeric(12, 2);
  inserted_count integer := 0;
  entry_kind gamification.point_entry_kind;
begin
  for source_row in
    with source_records as (
      select
        attendance.volunteer_id,
        attendance.ymhub_attendance_id as source_record_id,
        attendance.activity_title as source_title,
        attendance.activity_starts_at,
        attendance.state,
        attendance.verified_hours,
        attendance.verified_at,
        attendance.source_updated_at,
        jsonb_build_object(
          'ymhub_attendance_id', attendance.ymhub_attendance_id,
          'ymhub_activity_id', attendance.ymhub_activity_id,
          'activity_starts_at', attendance.activity_starts_at,
          'state', attendance.state,
          'verified_hours', attendance.verified_hours,
          'verified_at', attendance.verified_at,
          'source_updated_at', attendance.source_updated_at
        ) as source_snapshot
      from ymhub.attendance_snapshots as attendance
      where target_volunteer_id is null
        or attendance.volunteer_id = target_volunteer_id
    ),
    ledger_sources as (
      select distinct
        ledger.volunteer_id,
        ledger.source_record_id
      from gamification.point_ledger_entries as ledger
      where ledger.source_kind = 'ymhub_verified_attendance'
        and (
          target_volunteer_id is null
          or ledger.volunteer_id = target_volunteer_id
        )
    )
    select
      coalesce(source_records.volunteer_id, ledger_sources.volunteer_id) as volunteer_id,
      coalesce(source_records.source_record_id, ledger_sources.source_record_id) as source_record_id,
      source_records.source_title,
      source_records.activity_starts_at,
      source_records.state,
      source_records.verified_hours,
      source_records.verified_at,
      source_records.source_updated_at,
      source_records.source_snapshot
    from source_records
    full outer join ledger_sources
      on ledger_sources.volunteer_id = source_records.volunteer_id
      and ledger_sources.source_record_id = source_records.source_record_id
  loop
    perform pg_advisory_xact_lock(
      hashtextextended(
        source_row.volunteer_id::text || ':' || source_row.source_record_id,
        0
      )
    );

    select coalesce(sum(ledger.points_delta), 0::numeric)::numeric(12, 2)
    into current_points
    from gamification.point_ledger_entries as ledger
    where ledger.volunteer_id = source_row.volunteer_id
      and ledger.source_kind = 'ymhub_verified_attendance'
      and ledger.source_record_id = source_row.source_record_id;

    expected_points := 0;
    applicable_rule_id := null;
    applicable_method := null;
    applicable_value := null;

    if source_row.state = 'verified'
      and source_row.verified_at is not null
      and source_row.verified_hours is not null then
      select
        rules.id,
        rules.calculation_method,
        rules.points_value
      into
        applicable_rule_id,
        applicable_method,
        applicable_value
      from gamification.point_rules as rules
      where rules.source_kind = 'ymhub_verified_attendance'
        and rules.status in ('active', 'retired')
        and source_row.activity_starts_at >= rules.effective_from
        and (
          rules.effective_until is null
          or source_row.activity_starts_at < rules.effective_until
        )
      order by rules.effective_from desc, rules.version desc
      limit 1;

      if applicable_rule_id is not null then
        if applicable_method = 'flat' then
          expected_points := applicable_value;
        else
          expected_points := round(
            source_row.verified_hours * applicable_value,
            2
          );
        end if;
      end if;
    end if;

    delta := expected_points - current_points;

    if delta = 0 then
      continue;
    end if;

    if applicable_rule_id is null then
      select ledger.rule_id
      into applicable_rule_id
      from gamification.point_ledger_entries as ledger
      where ledger.volunteer_id = source_row.volunteer_id
        and ledger.source_kind = 'ymhub_verified_attendance'
        and ledger.source_record_id = source_row.source_record_id
      order by ledger.id desc
      limit 1;
    end if;

    if applicable_rule_id is null then
      continue;
    end if;

    entry_kind := case
      when expected_points = 0 then 'reversal'::gamification.point_entry_kind
      when current_points = 0 then 'award'::gamification.point_entry_kind
      else 'adjustment'::gamification.point_entry_kind
    end;

    insert into gamification.point_ledger_entries (
      volunteer_id,
      rule_id,
      source_kind,
      source_record_id,
      source_updated_at,
      source_title,
      entry_kind,
      points_delta,
      reason,
      source_snapshot
    ) values (
      source_row.volunteer_id,
      applicable_rule_id,
      'ymhub_verified_attendance',
      source_row.source_record_id,
      coalesce(source_row.source_updated_at, now()),
      coalesce(source_row.source_title, 'Removed YM Hub attendance record'),
      entry_kind,
      delta,
      case entry_kind
        when 'award' then 'Points awarded from verified YM Hub attendance.'
        when 'adjustment' then 'Points adjusted after the authoritative YM Hub record changed.'
        when 'reversal' then 'Points reversed because the authoritative YM Hub record no longer qualifies.'
      end,
      coalesce(
        source_row.source_snapshot,
        jsonb_build_object(
          'ymhub_attendance_id', source_row.source_record_id,
          'state', 'removed'
        )
      )
    );

    inserted_count := inserted_count + 1;
  end loop;

  return inserted_count;
end;
$$;

comment on function gamification.reconcile_verified_attendance_points(uuid) is
  'Idempotently derives point-ledger deltas from authoritative YM Hub verified-attendance snapshots. Operational roster attendance is never read.';

create or replace function ymhub.reconcile_gamification_points(
  target_volunteer_id uuid default null
)
returns integer
language sql
security definer
set search_path = pg_catalog
as $$
  select gamification.reconcile_verified_attendance_points(target_volunteer_id);
$$;

comment on function ymhub.reconcile_gamification_points(uuid) is
  'Service-only wrapper called after an authoritative YM Hub attendance import succeeds.';

revoke all on function ymhub.reconcile_gamification_points(uuid)
  from public, anon, authenticated;
grant execute on function ymhub.reconcile_gamification_points(uuid)
  to service_role;

alter table gamification.point_rules enable row level security;
alter table gamification.point_rules force row level security;
alter table gamification.point_ledger_entries enable row level security;
alter table gamification.point_ledger_entries force row level security;

create policy point_rules_select_authorized
on gamification.point_rules
for select
to authenticated
using (
  status in ('active', 'retired')
  or (select core.has_role('gamification_manager'::core.app_role))
  or (select core.can_support_volunteers())
);

create policy point_ledger_select_authorized
on gamification.point_ledger_entries
for select
to authenticated
using (
  volunteer_id = (select core.current_volunteer_id())
  or (select core.has_role('gamification_manager'::core.app_role))
  or (select core.can_support_volunteers())
);

create or replace function core.get_current_points_snapshot()
returns jsonb
language plpgsql
stable
security definer
set search_path = pg_catalog, core, gamification
as $$
declare
  current_user_id uuid := auth.uid();
  current_volunteer_id uuid;
  snapshot jsonb;
begin
  if current_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    return jsonb_build_object(
      'linked', false,
      'balance', 0,
      'last_changed_at', null,
      'active_rule', null,
      'entries', '[]'::jsonb
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
      'balance', 0,
      'last_changed_at', null,
      'active_rule', null,
      'entries', '[]'::jsonb
    );
  end if;

  select jsonb_build_object(
    'linked', true,
    'balance', coalesce((
      select sum(ledger.points_delta)
      from gamification.point_ledger_entries as ledger
      where ledger.volunteer_id = current_volunteer_id
    ), 0::numeric),
    'last_changed_at', (
      select max(ledger.created_at)
      from gamification.point_ledger_entries as ledger
      where ledger.volunteer_id = current_volunteer_id
    ),
    'active_rule', (
      select jsonb_build_object(
        'id', rules.id,
        'name', rules.name,
        'description', rules.description,
        'calculation_method', rules.calculation_method,
        'points_value', rules.points_value,
        'effective_from', rules.effective_from
      )
      from gamification.point_rules as rules
      where rules.status = 'active'
      order by rules.effective_from desc, rules.version desc
      limit 1
    ),
    'entries', coalesce((
      select jsonb_agg(to_jsonb(recent_entries) order by recent_entries.created_at desc, recent_entries.id desc)
      from (
        select
          ledger.id::text as id,
          ledger.source_record_id,
          ledger.source_title,
          ledger.entry_kind,
          ledger.points_delta,
          ledger.reason,
          ledger.created_at
        from gamification.point_ledger_entries as ledger
        where ledger.volunteer_id = current_volunteer_id
        order by ledger.created_at desc, ledger.id desc
        limit 20
      ) as recent_entries
    ), '[]'::jsonb)
  )
  into snapshot;

  return snapshot;
end;
$$;

comment on function core.get_current_points_snapshot() is
  'Returns the authenticated active volunteer''s own point balance, active rule and recent append-only history without exposing the gamification schema through the Data API.';

revoke all on function core.get_current_points_snapshot()
  from public, anon, authenticated;
grant execute on function core.get_current_points_snapshot()
  to authenticated, service_role;

revoke all on all tables in schema gamification from anon, authenticated;
revoke all on all sequences in schema gamification from anon, authenticated;
revoke all on all functions in schema gamification from public, anon, authenticated;

revoke all on function core.link_current_account_by_verified_email()
  from public, anon, authenticated;
grant execute on function core.link_current_account_by_verified_email()
  to authenticated, service_role;

grant select, insert, update, delete
  on gamification.point_rules to service_role;
grant select, insert
  on gamification.point_ledger_entries to service_role;
grant select
  on gamification.volunteer_point_balances to service_role;
grant usage, select
  on all sequences in schema gamification to service_role;
grant execute on function gamification.reconcile_verified_attendance_points(uuid)
  to service_role;

alter default privileges in schema gamification
  revoke all on tables from anon, authenticated;
alter default privileges in schema gamification
  revoke all on sequences from anon, authenticated;
alter default privileges in schema gamification
  revoke execute on functions from public, anon, authenticated;


commit;
