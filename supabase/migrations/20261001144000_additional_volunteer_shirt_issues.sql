begin;

alter table public.volunteer_shirt_issuances
  drop constraint if exists volunteer_shirt_issuances_volunteer_id_key;

alter table public.volunteer_shirt_issuances
  add column if not exists issue_kind text not null default 'initial',
  add column if not exists issue_reason text;

alter table public.volunteer_shirt_issuances
  drop constraint if exists volunteer_shirt_issuances_issue_kind_check,
  add constraint volunteer_shirt_issuances_issue_kind_check
    check (issue_kind in ('initial', 'additional')),
  drop constraint if exists volunteer_shirt_issuances_issue_reason_check,
  add constraint volunteer_shirt_issuances_issue_reason_check
    check (
      (issue_kind = 'initial' and issue_reason is null)
      or (
        issue_kind = 'additional'
        and issue_reason in (
          'replacement_damaged',
          'replacement_lost',
          'different_shirt_type',
          'programme_requirement',
          'new_allocation_cycle',
          'other'
        )
      )
    ),
  drop constraint if exists volunteer_shirt_issuances_additional_collection_check,
  add constraint volunteer_shirt_issuances_additional_collection_check
    check (issue_kind = 'initial' or collection_method = 'issued_now');

create index if not exists volunteer_shirt_issuances_volunteer_issued_idx
  on public.volunteer_shirt_issuances(volunteer_id, issued_at desc);

comment on column public.volunteer_shirt_issuances.issue_kind is
  'Initial records establish that a volunteer has received a shirt. Additional records represent explicitly authorised repeat issues.';
comment on column public.volunteer_shirt_issuances.issue_reason is
  'Required reason code for an additional shirt issue. Null for the initial shirt record.';

create or replace function public.server_issue_additional_volunteer_shirt(
  p_actor_user_id uuid,
  p_volunteer_id uuid,
  p_shirt_type text,
  p_actual_size text,
  p_issue_reason text,
  p_event_id uuid,
  p_preferred_size text,
  p_note text
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
  reason_label text;
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
    raise exception 'Volunteer Team or admin access is required'
      using errcode = '42501';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('additional-shirt:' || p_volunteer_id::text, 0)
  );

  if not exists (
    select 1
    from public.volunteer_shirt_issuances
    where volunteer_id = p_volunteer_id
  ) then
    raise exception 'An initial shirt record is required before issuing an additional shirt'
      using errcode = 'P0001';
  end if;

  if p_issue_reason not in (
    'replacement_damaged',
    'replacement_lost',
    'different_shirt_type',
    'programme_requirement',
    'new_allocation_cycle',
    'other'
  ) then
    raise exception 'A valid additional shirt reason is required'
      using errcode = '22023';
  end if;

  if p_issue_reason = 'other'
     and char_length(btrim(coalesce(p_note, ''))) < 5 then
    raise exception 'A short explanation is required for Other'
      using errcode = '22023';
  end if;

  if p_preferred_size is not null
     and p_preferred_size not in ('S','M','L','XL','2XL','3XL','5XL','7XL') then
    raise exception 'Invalid preferred shirt size' using errcode = '22023';
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

  select coalesce(sum(quantity_delta), 0)::integer
  into current_quantity
  from public.volunteer_shirt_inventory_transactions
  where sku_id = sku.id;

  if current_quantity < 1 then
    raise exception 'This shirt is out of stock' using errcode = 'P0001';
  end if;

  reason_label := case p_issue_reason
    when 'replacement_damaged' then 'Replacement - damaged'
    when 'replacement_lost' then 'Replacement - lost'
    when 'different_shirt_type' then 'Different shirt type'
    when 'programme_requirement' then 'Programme or role requirement'
    when 'new_allocation_cycle' then 'New allocation cycle'
    when 'other' then 'Other'
  end;

  insert into public.volunteer_shirt_issuances (
    volunteer_id,
    sku_id,
    event_id,
    issuance_source,
    issued_by,
    note,
    collection_method,
    preferred_size_at_issue,
    issue_kind,
    issue_reason
  )
  values (
    p_volunteer_id,
    sku.id,
    p_event_id,
    case when p_event_id is null then 'admin' else 'event' end,
    actor_id,
    nullif(btrim(coalesce(p_note, '')), ''),
    'issued_now',
    p_preferred_size,
    'additional',
    p_issue_reason
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
    'Additional volunteer shirt issued - ' || reason_label,
    actor_id
  );

  perform audit.write_event(
    'shirt.additional_issued',
    'volunteer',
    p_volunteer_id::text,
    jsonb_build_object(
      'issuance_id', issuance_id,
      'shirt_type', sku.shirt_type,
      'actual_size', sku.size,
      'preferred_size', p_preferred_size,
      'different_size', p_preferred_size is not null and p_preferred_size <> sku.size,
      'issue_reason', p_issue_reason,
      'issue_reason_label', reason_label,
      'event_id', p_event_id,
      'stock_decremented', true
    ),
    actor_id,
    null
  );

  return issuance_id;
end;
$$;

revoke all on function public.server_issue_additional_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)
  from public, anon, authenticated;
grant execute on function public.server_issue_additional_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)
  to service_role;

commit;
