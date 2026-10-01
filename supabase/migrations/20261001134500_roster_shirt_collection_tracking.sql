begin;

alter table public.volunteer_shirt_issuances
  add column if not exists collection_method text not null default 'issued_now',
  add column if not exists preferred_size_at_issue text;

update public.volunteer_shirt_issuances
set collection_method = 'already_collected'
where issuance_source = 'legacy'
  and collection_method = 'issued_now';

alter table public.volunteer_shirt_issuances
  drop constraint if exists volunteer_shirt_issuances_collection_method_check,
  add constraint volunteer_shirt_issuances_collection_method_check
    check (collection_method in ('issued_now', 'already_collected'));

alter table public.volunteer_shirt_issuances
  drop constraint if exists volunteer_shirt_issuances_preferred_size_check,
  add constraint volunteer_shirt_issuances_preferred_size_check
    check (
      preferred_size_at_issue is null
      or preferred_size_at_issue in ('S','M','L','XL','2XL','3XL','5XL','7XL')
    );

comment on column public.volunteer_shirt_issuances.collection_method is
  'Whether the record represents a shirt issued from tracked stock now or a shirt the volunteer had already collected.';
comment on column public.volunteer_shirt_issuances.preferred_size_at_issue is
  'Snapshot of the volunteer preferred shirt size when the record was made; sku_id stores the actual shirt received.';

create or replace function public.server_record_volunteer_shirt(
  p_actor_user_id uuid,
  p_volunteer_id uuid,
  p_shirt_type text,
  p_actual_size text,
  p_collection_method text,
  p_event_id uuid default null,
  p_preferred_size text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, core, audit
as $$
declare
  actor_id uuid := p_actor_user_id;
  sku public.volunteer_shirt_skus%rowtype;
  current_quantity integer;
  issuance_id uuid;
  audit_action text;
begin
  if actor_id is null then
    raise exception 'Actor identity is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = actor_id
      and a.status = 'active'
      and r.role in ('staff','volteam','admin')
  ) then
    raise exception 'Staff event operations access is required' using errcode = '42501';
  end if;

  if p_collection_method not in ('issued_now', 'already_collected') then
    raise exception 'Invalid shirt collection method' using errcode = '22023';
  end if;

  if p_preferred_size is not null
     and p_preferred_size not in ('S','M','L','XL','2XL','3XL','5XL','7XL') then
    raise exception 'Invalid preferred shirt size' using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.volunteer_shirt_issuances
    where volunteer_id = p_volunteer_id
  ) then
    raise exception 'This volunteer has already received a volunteer shirt'
      using errcode = '23505';
  end if;

  select *
  into sku
  from public.volunteer_shirt_skus
  where shirt_type = p_shirt_type
    and size = p_actual_size
    and active
  for update;

  if sku.id is null then
    raise exception 'Shirt SKU not found' using errcode = 'P0002';
  end if;

  if p_collection_method = 'issued_now' then
    select coalesce(sum(quantity_delta), 0)::integer
    into current_quantity
    from public.volunteer_shirt_inventory_transactions
    where sku_id = sku.id;

    if current_quantity < 1 then
      raise exception 'This shirt is out of stock' using errcode = 'P0001';
    end if;
  end if;

  insert into public.volunteer_shirt_issuances (
    volunteer_id,
    sku_id,
    event_id,
    issuance_source,
    issued_by,
    note,
    collection_method,
    preferred_size_at_issue
  )
  values (
    p_volunteer_id,
    sku.id,
    p_event_id,
    case when p_event_id is null then 'admin' else 'event' end,
    actor_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    p_collection_method,
    p_preferred_size
  )
  returning id into issuance_id;

  if p_collection_method = 'issued_now' then
    insert into public.volunteer_shirt_inventory_transactions (
      sku_id,
      transaction_type,
      quantity_delta,
      issuance_id,
      reason,
      recorded_by
    )
    values (
      sku.id,
      'issue',
      -1,
      issuance_id,
      case
        when p_preferred_size is not null and p_preferred_size <> sku.size
          then 'Volunteer shirt issued in a different size from profile preference'
        else 'Volunteer shirt issued'
      end,
      actor_id
    );
  end if;

  audit_action := case
    when p_collection_method = 'already_collected'
      then 'shirt.already_collected_recorded'
    else 'shirt.issued'
  end;

  perform audit.write_event(
    audit_action,
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'issuance_id', issuance_id,
      'shirt_type', sku.shirt_type,
      'actual_size', sku.size,
      'preferred_size', p_preferred_size,
      'different_size', p_preferred_size is not null and p_preferred_size <> sku.size,
      'collection_method', p_collection_method,
      'event_id', p_event_id,
      'stock_decremented', p_collection_method = 'issued_now'
    ),
    actor_id,
    null
  );

  return issuance_id;
end;
$$;

revoke all on function public.server_record_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.server_record_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)
  to service_role;

create or replace function public.server_mark_previous_volunteer_shirt_issue(
  p_actor_user_id uuid,
  p_volunteer_id uuid,
  p_shirt_type text,
  p_size text,
  p_issued_at timestamptz default now(),
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, core, audit
as $$
declare
  actor_id uuid := p_actor_user_id;
  sku_id uuid;
  issuance_id uuid;
begin
  if actor_id is null then
    raise exception 'Actor identity is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = actor_id
      and a.status = 'active'
      and r.role in ('volteam','admin')
  ) then
    raise exception 'Inventory management access is required' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.volunteer_shirt_issuances
    where volunteer_id = p_volunteer_id
  ) then
    raise exception 'This volunteer already has a shirt issuance record'
      using errcode = '23505';
  end if;

  select id
  into sku_id
  from public.volunteer_shirt_skus
  where shirt_type = p_shirt_type
    and size = p_size
    and active;

  if sku_id is null then
    raise exception 'Shirt SKU not found' using errcode = 'P0002';
  end if;

  insert into public.volunteer_shirt_issuances (
    volunteer_id,
    sku_id,
    issuance_source,
    issued_at,
    issued_by,
    note,
    collection_method
  )
  values (
    p_volunteer_id,
    sku_id,
    'legacy',
    p_issued_at,
    actor_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    'already_collected'
  )
  returning id into issuance_id;

  perform audit.write_event(
    'shirt.previous_issue_recorded',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'issuance_id', issuance_id,
      'sku_id', sku_id,
      'collection_method', 'already_collected',
      'stock_decremented', false
    ),
    actor_id,
    null
  );

  return issuance_id;
end;
$$;

revoke all on function public.server_mark_previous_volunteer_shirt_issue(uuid,uuid,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.server_mark_previous_volunteer_shirt_issue(uuid,uuid,text,text,timestamptz,text)
  to service_role;

commit;
