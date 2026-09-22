begin;

insert into gamification.point_rules (
  stable_key,
  version,
  name,
  description,
  source_kind,
  calculation_method,
  points_value,
  effective_from,
  status,
  activated_at
)
select
  'manual-recognition',
  1,
  'Staff recognition',
  'Audited recognition points explicitly awarded by authorised KELUARGA staff. The award amount is entered for each recognition action.',
  'manual_recognition',
  'flat',
  0,
  '2026-09-23T00:00:00Z'::timestamptz,
  'active',
  now()
where not exists (
  select 1
  from gamification.point_rules
  where stable_key = 'manual-recognition'
    and version = 1
);

create unique index if not exists point_ledger_manual_request_uidx
  on gamification.point_ledger_entries (source_record_id)
  where source_kind = 'manual_recognition';

create or replace function core.award_manual_points(
  p_volunteer_id uuid,
  p_points numeric,
  p_reason text,
  p_request_id uuid
)
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, core, gamification, audit
as $$
declare
  current_user_id uuid := auth.uid();
  clean_reason text := nullif(btrim(p_reason), '');
  manual_rule_id uuid;
  ledger_entry_id bigint;
  now_at timestamptz := now();
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active()
     or not (
       core.has_role('gamification_manager'::core.app_role)
       or core.has_role('admin'::core.app_role)
     ) then
    raise exception 'Gamification management permission is required'
      using errcode = '42501';
  end if;

  if p_volunteer_id is null
     or not exists (
       select 1 from core.volunteers where id = p_volunteer_id
     ) then
    raise exception 'Volunteer could not be found' using errcode = 'P0002';
  end if;

  if p_points is null
     or p_points <= 0
     or p_points > 10000
     or p_points <> round(p_points, 2) then
    raise exception 'Points must be between 0.01 and 10000 with at most two decimal places'
      using errcode = '22023';
  end if;

  if clean_reason is null
     or char_length(clean_reason) < 5
     or char_length(clean_reason) > 500 then
    raise exception 'A recognition reason between 5 and 500 characters is required'
      using errcode = '22023';
  end if;

  if p_request_id is null then
    raise exception 'A request ID is required' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('manual-points:' || p_request_id::text, 0)
  );

  select ledger.id
  into ledger_entry_id
  from gamification.point_ledger_entries as ledger
  where ledger.source_kind = 'manual_recognition'
    and ledger.source_record_id = p_request_id::text
  limit 1;

  if ledger_entry_id is not null then
    return ledger_entry_id;
  end if;

  select rules.id
  into manual_rule_id
  from gamification.point_rules as rules
  where rules.stable_key = 'manual-recognition'
    and rules.source_kind = 'manual_recognition'
    and rules.status = 'active'
  order by rules.version desc
  limit 1;

  if manual_rule_id is null then
    raise exception 'Manual recognition rule is unavailable' using errcode = '55000';
  end if;

  insert into gamification.point_ledger_entries (
    volunteer_id,
    rule_id,
    source_kind,
    source_record_id,
    source_occurred_at,
    source_updated_at,
    source_title,
    entry_kind,
    points_delta,
    reason,
    source_snapshot,
    created_by
  )
  values (
    p_volunteer_id,
    manual_rule_id,
    'manual_recognition',
    p_request_id::text,
    now_at,
    now_at,
    'Staff recognition',
    'award',
    p_points,
    clean_reason,
    jsonb_build_object(
      'type', 'manual_recognition',
      'request_id', p_request_id,
      'actor_user_id', current_user_id
    ),
    current_user_id
  )
  returning id into ledger_entry_id;

  perform audit.write_event(
    'gamification.manual_points_awarded',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'ledger_entry_id', ledger_entry_id,
      'points', p_points,
      'request_id', p_request_id
    ),
    current_user_id,
    p_request_id
  );

  return ledger_entry_id;
end;
$$;

comment on function core.award_manual_points(uuid, numeric, text, uuid) is
  'Appends one idempotent staff recognition award. Only active gamification managers and admins may call it.';

revoke all on function core.award_manual_points(uuid, numeric, text, uuid)
  from public, anon, authenticated;
grant execute on function core.award_manual_points(uuid, numeric, text, uuid)
  to authenticated, service_role;

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
    raise exception 'Authentication is required' using errcode = '42501';
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
        and rules.source_kind = 'ymhub_verified_attendance'
      order by rules.effective_from desc, rules.version desc
      limit 1
    ),
    'entries', coalesce((
      select jsonb_agg(
        to_jsonb(recent_entries)
        order by recent_entries.created_at desc, recent_entries.id desc
      )
      from (
        select
          ledger.id::text as id,
          ledger.source_kind,
          ledger.source_record_id,
          ledger.source_occurred_at,
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
  'Returns the authenticated active volunteer''s balance, verified-attendance rule and recent append-only history, including explicit source provenance.';

commit;
