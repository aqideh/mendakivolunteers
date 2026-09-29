begin;

create or replace function public.server_issue_volunteer_shirt(
  p_actor_user_id uuid,
  p_volunteer_id uuid,
  p_shirt_type text,
  p_size text,
  p_event_id uuid default null,
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
    and size = p_size
    and active
  for update;

  if sku.id is null then
    raise exception 'Shirt SKU not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity_delta), 0)::integer
  into current_quantity
  from public.volunteer_shirt_inventory_transactions
  where sku_id = sku.id;

  if current_quantity < 1 then
    raise exception 'This shirt is out of stock' using errcode = 'P0001';
  end if;

  insert into public.volunteer_shirt_issuances (
    volunteer_id,
    sku_id,
    event_id,
    issuance_source,
    issued_by,
    note
  )
  values (
    p_volunteer_id,
    sku.id,
    p_event_id,
    case when p_event_id is null then 'admin' else 'event' end,
    actor_id,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into issuance_id;

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
    'Volunteer shirt issued',
    actor_id
  );

  perform audit.write_event(
    'shirt.issued',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'issuance_id', issuance_id,
      'shirt_type', sku.shirt_type,
      'size', sku.size,
      'event_id', p_event_id
    ),
    actor_id,
    null
  );

  return issuance_id;
end;
$$;

create or replace function public.server_record_volunteer_shirt_stock(
  p_actor_user_id uuid,
  p_shirt_type text,
  p_size text,
  p_quantity_delta integer,
  p_transaction_type text,
  p_reason text default null
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
  transaction_id uuid;
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

  if p_transaction_type not in ('opening','receipt','adjustment','return') then
    raise exception 'Invalid stock transaction type' using errcode = '22023';
  end if;

  if p_quantity_delta = 0 then
    raise exception 'Stock quantity change cannot be zero' using errcode = '22023';
  end if;

  select *
  into sku
  from public.volunteer_shirt_skus
  where shirt_type = p_shirt_type
    and size = p_size
    and active
  for update;

  if sku.id is null then
    raise exception 'Shirt SKU not found' using errcode = 'P0002';
  end if;

  select coalesce(sum(quantity_delta), 0)::integer
  into current_quantity
  from public.volunteer_shirt_inventory_transactions
  where sku_id = sku.id;

  if current_quantity + p_quantity_delta < 0 then
    raise exception 'Stock adjustment would make inventory negative' using errcode = '22023';
  end if;

  insert into public.volunteer_shirt_inventory_transactions (
    sku_id,
    transaction_type,
    quantity_delta,
    reason,
    recorded_by
  )
  values (
    sku.id,
    p_transaction_type,
    p_quantity_delta,
    nullif(btrim(coalesce(p_reason, '')), ''),
    actor_id
  )
  returning id into transaction_id;

  perform audit.write_event(
    'shirt.stock_recorded',
    'volunteer_shirt_sku',
    sku.id::text,
    jsonb_build_object(
      'shirt_type', sku.shirt_type,
      'size', sku.size,
      'quantity_delta', p_quantity_delta,
      'transaction_type', p_transaction_type
    ),
    actor_id,
    null
  );

  return transaction_id;
end;
$$;

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
    note
  )
  values (
    p_volunteer_id,
    sku_id,
    'legacy',
    p_issued_at,
    actor_id,
    nullif(btrim(coalesce(p_note, '')), '')
  )
  returning id into issuance_id;

  perform audit.write_event(
    'shirt.previous_issue_recorded',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object('issuance_id', issuance_id, 'sku_id', sku_id),
    actor_id,
    null
  );

  return issuance_id;
end;
$$;

revoke all on function public.server_issue_volunteer_shirt(uuid,uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.server_issue_volunteer_shirt(uuid,uuid,text,text,uuid,text)
  to service_role;

revoke all on function public.server_record_volunteer_shirt_stock(uuid,text,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.server_record_volunteer_shirt_stock(uuid,text,text,integer,text,text)
  to service_role;

revoke all on function public.server_mark_previous_volunteer_shirt_issue(uuid,uuid,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.server_mark_previous_volunteer_shirt_issue(uuid,uuid,text,text,timestamptz,text)
  to service_role;

commit;
