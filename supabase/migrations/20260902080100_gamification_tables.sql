begin;

create type gamification.point_rule_status as enum (
  'draft',
  'active',
  'retired'
);

create type gamification.point_source_kind as enum (
  'ymhub_verified_attendance'
);

create type gamification.point_calculation_method as enum (
  'flat',
  'per_verified_hour'
);

create type gamification.point_entry_kind as enum (
  'award',
  'adjustment',
  'reversal'
);

create table gamification.point_rules (
  id uuid primary key default gen_random_uuid(),
  stable_key text not null check (
    char_length(stable_key) between 1 and 100
    and stable_key = lower(stable_key)
  ),
  version integer not null check (version > 0),
  name text not null check (char_length(name) between 1 and 120),
  description text not null check (char_length(description) between 1 and 1000),
  source_kind gamification.point_source_kind not null,
  calculation_method gamification.point_calculation_method not null,
  points_value numeric(10, 2) not null check (points_value >= 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  status gamification.point_rule_status not null default 'draft',
  created_by uuid references core.user_accounts (id) on delete set null,
  activated_by uuid references core.user_accounts (id) on delete set null,
  activated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (stable_key, version),
  unique (id, source_kind),
  constraint point_rules_effective_order check (
    effective_until is null or effective_until > effective_from
  ),
  constraint point_rules_activation_consistent check (
    (status = 'draft' and activated_at is null and activated_by is null)
    or (status in ('active', 'retired') and activated_at is not null)
  )
);

comment on table gamification.point_rules is
  'Versioned KELUARGA point rules. Draft rules award nothing; activated versions are retained for reproducible recalculation.';

create unique index point_rules_one_active_per_source_idx
  on gamification.point_rules (source_kind)
  where status = 'active';

create index point_rules_effective_idx
  on gamification.point_rules (source_kind, effective_from, effective_until)
  where status in ('active', 'retired');

create index point_rules_created_by_idx
  on gamification.point_rules (created_by)
  where created_by is not null;

create index point_rules_activated_by_idx
  on gamification.point_rules (activated_by)
  where activated_by is not null;

create or replace function gamification.protect_point_rule_history()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'Activated point rules are retained for auditability'
        using errcode = 'P0001';
    end if;

    return old;
  end if;

  if old.status in ('active', 'retired') then
    if old.status = 'active'
      and new.status = 'retired'
      and new.effective_until is not null
      and new.effective_until > new.effective_from
      and (to_jsonb(new) - array['status', 'effective_until', 'updated_at'])
        = (to_jsonb(old) - array['status', 'effective_until', 'updated_at']) then
      return new;
    end if;

    raise exception 'Activated point rules are immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create trigger point_rules_protect_history
before update or delete on gamification.point_rules
for each row execute function gamification.protect_point_rule_history();

create table gamification.point_ledger_entries (
  id bigint generated always as identity primary key,
  volunteer_id uuid not null references core.volunteers (id) on delete restrict,
  rule_id uuid not null,
  source_kind gamification.point_source_kind not null,
  source_record_id text not null check (
    char_length(source_record_id) between 1 and 128
  ),
  source_updated_at timestamptz not null,
  source_title text not null check (char_length(source_title) between 1 and 240),
  entry_kind gamification.point_entry_kind not null,
  points_delta numeric(12, 2) not null check (points_delta <> 0),
  reason text not null check (char_length(reason) between 1 and 500),
  source_snapshot jsonb not null check (jsonb_typeof(source_snapshot) = 'object'),
  created_at timestamptz not null default now(),
  created_by uuid references core.user_accounts (id) on delete set null,
  constraint point_ledger_rule_source_fk
    foreign key (rule_id, source_kind)
    references gamification.point_rules (id, source_kind)
    on delete restrict
);

comment on table gamification.point_ledger_entries is
  'Append-only point ledger. Corrections are represented by adjustment or reversal entries; existing entries are never edited.';

create or replace function gamification.validate_point_ledger_entry()
returns trigger
language plpgsql
set search_path = pg_catalog, gamification
as $$
declare
  rule_status gamification.point_rule_status;
begin
  select rules.status
  into rule_status
  from gamification.point_rules as rules
  where rules.id = new.rule_id
    and rules.source_kind = new.source_kind;

  if rule_status is null then
    raise exception 'Point ledger rule is unavailable'
      using errcode = '23503';
  end if;

  if rule_status = 'draft' then
    raise exception 'Draft point rules cannot create ledger entries'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger point_ledger_validate_insert
before insert on gamification.point_ledger_entries
for each row execute function gamification.validate_point_ledger_entry();

create index point_ledger_volunteer_created_idx
  on gamification.point_ledger_entries (volunteer_id, created_at desc, id desc);
create index point_ledger_source_idx
  on gamification.point_ledger_entries (
    volunteer_id,
    source_kind,
    source_record_id,
    id
  );

create index point_ledger_rule_id_idx
  on gamification.point_ledger_entries (rule_id);

create index point_ledger_created_by_idx
  on gamification.point_ledger_entries (created_by)
  where created_by is not null;

create or replace function gamification.prevent_point_ledger_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  raise exception 'Point ledger entries are append-only'
    using errcode = 'P0001';
end;
$$;

create trigger point_ledger_prevent_update
before update on gamification.point_ledger_entries
for each row execute function gamification.prevent_point_ledger_mutation();

create trigger point_ledger_prevent_delete
before delete on gamification.point_ledger_entries
for each row execute function gamification.prevent_point_ledger_mutation();

create trigger point_rules_set_updated_at
before update on gamification.point_rules
for each row execute function core.set_updated_at();

create view gamification.volunteer_point_balances
with (security_invoker = true)
as
select
  volunteer_id,
  coalesce(sum(points_delta), 0::numeric)::numeric(12, 2) as points_balance,
  max(created_at) as last_changed_at
from gamification.point_ledger_entries
group by volunteer_id;

comment on view gamification.volunteer_point_balances is
  'Current point balance calculated from the append-only ledger under the caller''s row-level-security context.';


commit;
