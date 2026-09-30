do $$
begin create type gamification.reward_partner_status as enum ('active','inactive');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_status as enum ('draft','active','paused','retired');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_fulfilment_method as enum ('voucher_code','manual');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_voucher_status as enum ('available','assigned','void');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_redemption_status as enum ('pending_fulfilment','issued','cancelled','refunded');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_audit_event_kind as enum ('created','voucher_assigned','status_changed','points_refunded');
exception when duplicate_object then null; end $$;
do $$
begin create type gamification.reward_audit_actor_kind as enum ('volunteer','staff','system','partner');
exception when duplicate_object then null; end $$;

create table if not exists gamification.reward_partners (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug=lower(slug) and slug ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(slug) between 2 and 100),
  name text not null check (char_length(name) between 2 and 160),
  contact_name text null check (contact_name is null or char_length(contact_name)<=160),
  contact_email text null check (contact_email is null or (contact_email=lower(btrim(contact_email)) and char_length(contact_email) between 3 and 254 and contact_email like '%@%')),
  status gamification.reward_partner_status not null default 'active',
  created_by uuid null references core.user_accounts(id) on delete set null,
  updated_by uuid null references core.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists gamification.rewards (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid not null references gamification.reward_partners(id) on delete restrict,
  stable_key text not null unique check (stable_key=lower(stable_key) and stable_key ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' and char_length(stable_key) between 3 and 120),
  name text not null check (char_length(name) between 2 and 160),
  description text not null check (char_length(description) between 5 and 1200),
  terms_text text null check (terms_text is null or char_length(terms_text)<=4000),
  points_cost numeric(12,2) not null check (points_cost>0),
  fulfilment_method gamification.reward_fulfilment_method not null default 'manual',
  quantity_limit integer null check (quantity_limit is null or quantity_limit>0),
  per_volunteer_limit integer not null default 1 check (per_volunteer_limit>0),
  available_from timestamptz null,
  available_until timestamptz null,
  status gamification.reward_status not null default 'draft',
  partner_reference text null check (partner_reference is null or char_length(partner_reference)<=200),
  created_by uuid null references core.user_accounts(id) on delete set null,
  updated_by uuid null references core.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint rewards_availability_order check (available_until is null or available_from is null or available_until>available_from)
);

create table if not exists gamification.reward_redemptions (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null unique,
  volunteer_id uuid not null references core.volunteers(id) on delete restrict,
  reward_id uuid not null references gamification.rewards(id) on delete restrict,
  partner_id uuid not null references gamification.reward_partners(id) on delete restrict,
  volunteer_code_snapshot text not null check (volunteer_code_snapshot ~ '^KEL[0-9]{5}$'),
  volunteer_name_snapshot text null check (volunteer_name_snapshot is null or char_length(volunteer_name_snapshot)<=160),
  volunteer_email_snapshot text null check (volunteer_email_snapshot is null or char_length(volunteer_email_snapshot)<=254),
  reward_name_snapshot text not null check (char_length(reward_name_snapshot) between 2 and 160),
  partner_name_snapshot text not null check (char_length(partner_name_snapshot) between 2 and 160),
  points_cost numeric(12,2) not null check (points_cost>0),
  status gamification.reward_redemption_status not null,
  redeemed_at timestamptz not null default now(),
  issued_at timestamptz null,
  cancelled_at timestamptz null,
  refunded_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint reward_redemption_status_timestamps check (
    (status<>'issued' or issued_at is not null)
    and (status<>'cancelled' or cancelled_at is not null)
    and (status<>'refunded' or refunded_at is not null)
  )
);

create table if not exists gamification.reward_vouchers (
  id uuid primary key default gen_random_uuid(),
  reward_id uuid not null references gamification.rewards(id) on delete restrict,
  voucher_code text not null unique check (char_length(voucher_code) between 1 and 500),
  sponsor_reference text null check (sponsor_reference is null or char_length(sponsor_reference)<=240),
  status gamification.reward_voucher_status not null default 'available',
  redemption_id uuid null unique references gamification.reward_redemptions(id) on delete restrict,
  expires_at timestamptz null,
  assigned_at timestamptz null,
  created_at timestamptz not null default now(),
  constraint reward_voucher_assignment_consistent check (
    (status='available' and redemption_id is null and assigned_at is null)
    or (status='assigned' and redemption_id is not null and assigned_at is not null)
    or status='void'
  )
);

create table if not exists gamification.reward_redemption_audit (
  id bigint generated always as identity primary key,
  redemption_id uuid not null references gamification.reward_redemptions(id) on delete restrict,
  event_kind gamification.reward_audit_event_kind not null,
  actor_kind gamification.reward_audit_actor_kind not null,
  actor_user_id uuid null references core.user_accounts(id) on delete set null,
  event_data jsonb not null default '{}'::jsonb check (jsonb_typeof(event_data)='object'),
  created_at timestamptz not null default now()
);

create table if not exists gamification.reward_partner_report_exports (
  id uuid primary key default gen_random_uuid(),
  partner_id uuid null references gamification.reward_partners(id) on delete restrict,
  generated_by uuid null references core.user_accounts(id) on delete set null,
  generated_at timestamptz not null default now(),
  row_count integer not null check (row_count>=0),
  parameters jsonb not null default '{}'::jsonb check (jsonb_typeof(parameters)='object'),
  created_at timestamptz not null default now()
);

create index if not exists rewards_partner_status_idx on gamification.rewards(partner_id,status,available_from,available_until);
create index if not exists reward_redemptions_partner_redeemed_idx on gamification.reward_redemptions(partner_id,redeemed_at desc);
create index if not exists reward_redemptions_reward_redeemed_idx on gamification.reward_redemptions(reward_id,redeemed_at desc);
create index if not exists reward_redemptions_volunteer_redeemed_idx on gamification.reward_redemptions(volunteer_id,redeemed_at desc);
create index if not exists reward_vouchers_reward_status_idx on gamification.reward_vouchers(reward_id,status,expires_at);
create index if not exists reward_redemption_audit_redemption_created_idx on gamification.reward_redemption_audit(redemption_id,created_at,id);
create index if not exists reward_partner_report_exports_partner_created_idx on gamification.reward_partner_report_exports(partner_id,generated_at desc);

insert into gamification.point_rules (
  stable_key,version,name,description,source_kind,calculation_method,points_value,effective_from,status,activated_at
)
select
  'reward-redemption',1,'Reward redemption',
  'Classification rule for audited point deductions and reversals created by reward redemptions.',
  'reward_redemption'::gamification.point_source_kind,
  'flat'::gamification.point_calculation_method,
  0,now(),'active'::gamification.point_rule_status,now()
where not exists (
  select 1 from gamification.point_rules where stable_key='reward-redemption' and version=1
);

create unique index if not exists point_ledger_reward_redemption_uidx
  on gamification.point_ledger_entries(source_record_id,entry_kind)
  where source_kind='reward_redemption'::gamification.point_source_kind;

create or replace function gamification.prevent_reward_audit_mutation()
returns trigger language plpgsql set search_path='pg_catalog'
as $$ begin raise exception 'Reward redemption audit entries are append-only' using errcode='P0001'; end; $$;

drop trigger if exists reward_redemption_audit_immutable on gamification.reward_redemption_audit;
create trigger reward_redemption_audit_immutable
before update or delete on gamification.reward_redemption_audit
for each row execute function gamification.prevent_reward_audit_mutation();

alter table gamification.reward_partners enable row level security;
alter table gamification.rewards enable row level security;
alter table gamification.reward_redemptions enable row level security;
alter table gamification.reward_vouchers enable row level security;
alter table gamification.reward_redemption_audit enable row level security;
alter table gamification.reward_partner_report_exports enable row level security;

revoke all on gamification.reward_partners from public,anon,authenticated;
revoke all on gamification.rewards from public,anon,authenticated;
revoke all on gamification.reward_redemptions from public,anon,authenticated;
revoke all on gamification.reward_vouchers from public,anon,authenticated;
revoke all on gamification.reward_redemption_audit from public,anon,authenticated;
revoke all on gamification.reward_partner_report_exports from public,anon,authenticated;
grant select,insert,update,delete on gamification.reward_partners to service_role;
grant select,insert,update,delete on gamification.rewards to service_role;
grant select,insert,update,delete on gamification.reward_redemptions to service_role;
grant select,insert,update,delete on gamification.reward_vouchers to service_role;
grant select,insert on gamification.reward_redemption_audit to service_role;
grant select,insert on gamification.reward_partner_report_exports to service_role;

create or replace function core.get_current_rewards_snapshot()
returns jsonb language plpgsql stable security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid();
  v_volunteer uuid;
  v_balance numeric(12,2):=0;
begin
  if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
  if not core.is_current_account_active() then
    return jsonb_build_object('linked',false,'balance',0,'rewards','[]'::jsonb,'redemptions','[]'::jsonb);
  end if;
  select v.id into v_volunteer from core.volunteers v where v.auth_user_id=v_user;
  if v_volunteer is null then
    return jsonb_build_object('linked',false,'balance',0,'rewards','[]'::jsonb,'redemptions','[]'::jsonb);
  end if;
  select coalesce(sum(ple.points_delta),0)::numeric(12,2)
    into v_balance from gamification.point_ledger_entries ple where ple.volunteer_id=v_volunteer;

  return jsonb_build_object(
    'linked',true,
    'balance',v_balance,
    'rewards',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.points_cost,x.name)
      from (
        select r.id::text id,r.name,r.description,r.terms_text,r.points_cost,r.fulfilment_method,
               r.per_volunteer_limit,r.available_until,p.name partner_name,
          (v_balance>=r.points_cost
           and (select count(*) from gamification.reward_redemptions rr where rr.reward_id=r.id and rr.volunteer_id=v_volunteer and rr.status in ('pending_fulfilment','issued'))<r.per_volunteer_limit
           and (r.quantity_limit is null or (select count(*) from gamification.reward_redemptions rr where rr.reward_id=r.id and rr.status in ('pending_fulfilment','issued'))<r.quantity_limit)
           and (r.fulfilment_method<>'voucher_code' or exists(select 1 from gamification.reward_vouchers rv where rv.reward_id=r.id and rv.status='available' and (rv.expires_at is null or rv.expires_at>now())))) can_redeem,
          case
            when (select count(*) from gamification.reward_redemptions rr where rr.reward_id=r.id and rr.volunteer_id=v_volunteer and rr.status in ('pending_fulfilment','issued'))>=r.per_volunteer_limit then 'limit_reached'
            when r.quantity_limit is not null and (select count(*) from gamification.reward_redemptions rr where rr.reward_id=r.id and rr.status in ('pending_fulfilment','issued'))>=r.quantity_limit then 'out_of_stock'
            when r.fulfilment_method='voucher_code' and not exists(select 1 from gamification.reward_vouchers rv where rv.reward_id=r.id and rv.status='available' and (rv.expires_at is null or rv.expires_at>now())) then 'out_of_stock'
            when v_balance<r.points_cost then 'insufficient_points'
            else null
          end unavailable_reason
        from gamification.rewards r
        join gamification.reward_partners p on p.id=r.partner_id
        where r.status='active' and p.status='active'
          and (r.available_from is null or r.available_from<=now())
          and (r.available_until is null or r.available_until>now())
        order by r.points_cost,r.name limit 100
      ) x
    ),'[]'::jsonb),
    'redemptions',coalesce((
      select jsonb_agg(to_jsonb(x) order by x.redeemed_at desc)
      from (
        select rr.id::text id,rr.reward_name_snapshot reward_name,rr.partner_name_snapshot partner_name,
               rr.points_cost,rr.status,rr.redeemed_at,rr.issued_at,rv.voucher_code,rv.expires_at voucher_expires_at
        from gamification.reward_redemptions rr
        left join gamification.reward_vouchers rv on rv.redemption_id=rr.id
        where rr.volunteer_id=v_volunteer
        order by rr.redeemed_at desc limit 20
      ) x
    ),'[]'::jsonb)
  );
end $$;

revoke all on function core.get_current_rewards_snapshot() from public;
revoke all on function core.get_current_rewards_snapshot() from anon;
grant execute on function core.get_current_rewards_snapshot() to authenticated;

create or replace function core.redeem_reward(p_reward_id uuid,p_request_id uuid)
returns jsonb language plpgsql security definer set search_path=''
as $$
declare
  v_user uuid:=auth.uid(); v_volunteer uuid; v_volunteer_code text; v_volunteer_name text; v_volunteer_email text;
  v_balance numeric(12,2):=0; v_reward record; v_existing record; v_rule_id uuid; v_redemption_id uuid;
  v_redemption_status gamification.reward_redemption_status; v_voucher record; v_now timestamptz:=now();
  v_own_count integer:=0; v_total_count integer:=0;
begin
  if v_user is null then raise exception 'authentication_required' using errcode='42501'; end if;
  if not core.is_current_account_active() then raise exception 'account_inactive' using errcode='42501'; end if;

  select v.id,v.volunteer_code,v.display_name,v.primary_email_normalized
    into v_volunteer,v_volunteer_code,v_volunteer_name,v_volunteer_email
  from core.volunteers v where v.auth_user_id=v_user for update;
  if v_volunteer is null then raise exception 'volunteer_profile_required' using errcode='P0001'; end if;

  select rr.id,rr.volunteer_id,rr.reward_name_snapshot,rr.partner_name_snapshot,rr.points_cost,rr.status,rr.redeemed_at,
         rv.voucher_code,rv.expires_at voucher_expires_at
    into v_existing
  from gamification.reward_redemptions rr
  left join gamification.reward_vouchers rv on rv.redemption_id=rr.id
  where rr.request_id=p_request_id;

  if v_existing.id is not null then
    if v_existing.volunteer_id<>v_volunteer then raise exception 'invalid_request' using errcode='42501'; end if;
    return jsonb_build_object('id',v_existing.id,'reward_name',v_existing.reward_name_snapshot,'partner_name',v_existing.partner_name_snapshot,
      'points_cost',v_existing.points_cost,'status',v_existing.status,'redeemed_at',v_existing.redeemed_at,
      'voucher_code',v_existing.voucher_code,'voucher_expires_at',v_existing.voucher_expires_at);
  end if;

  select r.id,r.partner_id,r.name,r.points_cost,r.fulfilment_method,r.quantity_limit,r.per_volunteer_limit,
         r.available_from,r.available_until,r.status,p.name partner_name,p.status partner_status
    into v_reward
  from gamification.rewards r join gamification.reward_partners p on p.id=r.partner_id
  where r.id=p_reward_id for update of r;

  if v_reward.id is null or v_reward.status<>'active' or v_reward.partner_status<>'active'
     or (v_reward.available_from is not null and v_reward.available_from>v_now)
     or (v_reward.available_until is not null and v_reward.available_until<=v_now)
  then raise exception 'reward_unavailable' using errcode='P0001'; end if;

  select coalesce(sum(ple.points_delta),0)::numeric(12,2) into v_balance
    from gamification.point_ledger_entries ple where ple.volunteer_id=v_volunteer;
  if v_balance<v_reward.points_cost then raise exception 'insufficient_points' using errcode='P0001'; end if;

  select count(*) into v_own_count from gamification.reward_redemptions rr
    where rr.reward_id=v_reward.id and rr.volunteer_id=v_volunteer and rr.status in ('pending_fulfilment','issued');
  if v_own_count>=v_reward.per_volunteer_limit then raise exception 'limit_reached' using errcode='P0001'; end if;

  if v_reward.quantity_limit is not null then
    select count(*) into v_total_count from gamification.reward_redemptions rr
      where rr.reward_id=v_reward.id and rr.status in ('pending_fulfilment','issued');
    if v_total_count>=v_reward.quantity_limit then raise exception 'out_of_stock' using errcode='P0001'; end if;
  end if;

  if v_reward.fulfilment_method='voucher_code' then
    select rv.id,rv.voucher_code,rv.expires_at into v_voucher
    from gamification.reward_vouchers rv
    where rv.reward_id=v_reward.id and rv.status='available' and (rv.expires_at is null or rv.expires_at>v_now)
    order by rv.expires_at nulls last,rv.created_at for update skip locked limit 1;
    if v_voucher.id is null then raise exception 'out_of_stock' using errcode='P0001'; end if;
    v_redemption_status:='issued';
  else
    v_redemption_status:='pending_fulfilment';
  end if;

  select pr.id into v_rule_id from gamification.point_rules pr
  where pr.stable_key='reward-redemption' and pr.status='active' and pr.effective_from<=v_now
    and (pr.effective_until is null or pr.effective_until>v_now)
  order by pr.version desc limit 1;
  if v_rule_id is null then raise exception 'redemption_rule_unavailable' using errcode='P0001'; end if;

  insert into gamification.reward_redemptions(
    request_id,volunteer_id,reward_id,partner_id,volunteer_code_snapshot,volunteer_name_snapshot,volunteer_email_snapshot,
    reward_name_snapshot,partner_name_snapshot,points_cost,status,redeemed_at,issued_at
  ) values (
    p_request_id,v_volunteer,v_reward.id,v_reward.partner_id,v_volunteer_code,v_volunteer_name,v_volunteer_email,
    v_reward.name,v_reward.partner_name,v_reward.points_cost,v_redemption_status,v_now,
    case when v_redemption_status='issued' then v_now else null end
  ) returning id into v_redemption_id;

  if v_reward.fulfilment_method='voucher_code' then
    update gamification.reward_vouchers set status='assigned',redemption_id=v_redemption_id,assigned_at=v_now where id=v_voucher.id;
  end if;

  insert into gamification.point_ledger_entries(
    volunteer_id,rule_id,source_kind,source_record_id,source_occurred_at,source_updated_at,source_title,
    entry_kind,points_delta,reason,source_snapshot,created_by
  ) values (
    v_volunteer,v_rule_id,'reward_redemption'::gamification.point_source_kind,v_redemption_id::text,v_now,v_now,
    'Redeemed: '||v_reward.name,'adjustment'::gamification.point_entry_kind,-v_reward.points_cost,'Points redeemed for reward',
    jsonb_build_object('redemption_id',v_redemption_id,'reward_id',v_reward.id,'partner_id',v_reward.partner_id,'points_cost',v_reward.points_cost),
    v_user
  );

  insert into gamification.reward_redemption_audit(redemption_id,event_kind,actor_kind,actor_user_id,event_data)
  values(v_redemption_id,'created','volunteer',v_user,
    jsonb_build_object('reward_id',v_reward.id,'partner_id',v_reward.partner_id,'points_cost',v_reward.points_cost,'status',v_redemption_status));

  if v_reward.fulfilment_method='voucher_code' then
    insert into gamification.reward_redemption_audit(redemption_id,event_kind,actor_kind,actor_user_id,event_data)
    values(v_redemption_id,'voucher_assigned','system',null,jsonb_build_object('voucher_id',v_voucher.id,'sponsor_reference_present',false));
  end if;

  return jsonb_build_object('id',v_redemption_id,'reward_name',v_reward.name,'partner_name',v_reward.partner_name,
    'points_cost',v_reward.points_cost,'status',v_redemption_status,'redeemed_at',v_now,
    'voucher_code',case when v_reward.fulfilment_method='voucher_code' then v_voucher.voucher_code else null end,
    'voucher_expires_at',case when v_reward.fulfilment_method='voucher_code' then v_voucher.expires_at else null end);
end $$;

revoke all on function core.redeem_reward(uuid,uuid) from public;
revoke all on function core.redeem_reward(uuid,uuid) from anon;
grant execute on function core.redeem_reward(uuid,uuid) to authenticated;
