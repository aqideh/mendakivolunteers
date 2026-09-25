begin;

create table if not exists public.volunteer_private_details (
  volunteer_id uuid primary key references core.volunteers(id) on delete cascade,
  date_of_birth date,
  postal_code text,
  address_line text,
  latitude numeric(10,7),
  longitude numeric(10,7),
  neighbourhood text,
  planning_area text,
  electoral_division text,
  electoral_boundary_version text,
  address_verified_at timestamptz,
  dietary_requirements text,
  food_allergies text,
  no_known_food_allergies boolean not null default false,
  tshirt_size text,
  highest_qualification text,
  institution text,
  field_of_study text,
  languages_spoken text[] not null default '{}'::text[],
  emergency_contact_name text,
  emergency_contact_mobile text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint volunteer_private_details_postal_check check (
    postal_code is null or postal_code ~ '^[0-9]{6}$'
  ),
  constraint volunteer_private_details_address_check check (
    address_line is null or char_length(address_line) <= 500
  ),
  constraint volunteer_private_details_lat_check check (
    latitude is null or latitude between 1.1 and 1.6
  ),
  constraint volunteer_private_details_lng_check check (
    longitude is null or longitude between 103.5 and 104.2
  ),
  constraint volunteer_private_details_neighbourhood_check check (
    neighbourhood is null or char_length(neighbourhood) <= 120
  ),
  constraint volunteer_private_details_planning_area_check check (
    planning_area is null or char_length(planning_area) <= 120
  ),
  constraint volunteer_private_details_electoral_division_check check (
    electoral_division is null or char_length(electoral_division) <= 160
  ),
  constraint volunteer_private_details_dietary_check check (
    dietary_requirements is null or char_length(dietary_requirements) <= 800
  ),
  constraint volunteer_private_details_allergies_check check (
    food_allergies is null or char_length(food_allergies) <= 800
  ),
  constraint volunteer_private_details_allergy_consistency check (
    not no_known_food_allergies
    or food_allergies is null
    or btrim(food_allergies) = ''
  ),
  constraint volunteer_private_details_tshirt_size_check check (
    tshirt_size is null or tshirt_size in ('S','M','L','XL','2XL','3XL','5XL','7XL')
  ),
  constraint volunteer_private_details_qualification_check check (
    highest_qualification is null or highest_qualification in (
      'primary',
      'secondary',
      'n_level',
      'o_level',
      'a_level',
      'ite',
      'diploma',
      'professional_certificate',
      'bachelors',
      'postgraduate',
      'other'
    )
  ),
  constraint volunteer_private_details_institution_check check (
    institution is null or char_length(institution) <= 200
  ),
  constraint volunteer_private_details_field_of_study_check check (
    field_of_study is null or char_length(field_of_study) <= 200
  ),
  constraint volunteer_private_details_languages_check check (
    cardinality(languages_spoken) <= 12
  ),
  constraint volunteer_private_details_emergency_name_check check (
    emergency_contact_name is null or char_length(emergency_contact_name) <= 160
  ),
  constraint volunteer_private_details_emergency_mobile_check check (
    emergency_contact_mobile is null or char_length(emergency_contact_mobile) <= 40
  )
);

comment on table public.volunteer_private_details is
  'Private volunteer-maintained operational profile details keyed to the canonical core.volunteers UUID. Not public profile content.';
comment on column public.volunteer_private_details.electoral_division is
  'Derived electoral division for geographic reporting. Populate only from a verified boundary dataset.';
comment on column public.volunteer_private_details.electoral_boundary_version is
  'Boundary dataset/version used to derive electoral_division.';

drop trigger if exists volunteer_private_details_set_updated_at
  on public.volunteer_private_details;
create trigger volunteer_private_details_set_updated_at
before update on public.volunteer_private_details
for each row execute function core.set_updated_at();

alter table public.volunteer_private_details enable row level security;

drop policy if exists "Volunteers can read their private details"
  on public.volunteer_private_details;
create policy "Volunteers can read their private details"
on public.volunteer_private_details
for select
to authenticated
using (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Volunteers can create their private details"
  on public.volunteer_private_details;
create policy "Volunteers can create their private details"
on public.volunteer_private_details
for insert
to authenticated
with check (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Volunteers can update their private details"
  on public.volunteer_private_details;
create policy "Volunteers can update their private details"
on public.volunteer_private_details
for update
to authenticated
using (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_private_details.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Staff can read private volunteer details"
  on public.volunteer_private_details;
create policy "Staff can read private volunteer details"
on public.volunteer_private_details
for select
to authenticated
using (
  exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role in ('volunteer_leader','staff','volteam','admin')
  )
);

grant select, insert, update on public.volunteer_private_details to authenticated;

create or replace function audit.capture_volunteer_private_detail_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, audit
as $$
declare
  changed_fields text[] := '{}'::text[];
begin
  if old.date_of_birth is distinct from new.date_of_birth then changed_fields := array_append(changed_fields, 'date_of_birth'); end if;
  if old.postal_code is distinct from new.postal_code then changed_fields := array_append(changed_fields, 'postal_code'); end if;
  if old.address_line is distinct from new.address_line then changed_fields := array_append(changed_fields, 'address_line'); end if;
  if old.dietary_requirements is distinct from new.dietary_requirements then changed_fields := array_append(changed_fields, 'dietary_requirements'); end if;
  if old.food_allergies is distinct from new.food_allergies or old.no_known_food_allergies is distinct from new.no_known_food_allergies then
    changed_fields := array_append(changed_fields, 'food_allergies');
  end if;
  if old.tshirt_size is distinct from new.tshirt_size then changed_fields := array_append(changed_fields, 'tshirt_size'); end if;
  if old.highest_qualification is distinct from new.highest_qualification then changed_fields := array_append(changed_fields, 'highest_qualification'); end if;
  if old.institution is distinct from new.institution then changed_fields := array_append(changed_fields, 'institution'); end if;
  if old.field_of_study is distinct from new.field_of_study then changed_fields := array_append(changed_fields, 'field_of_study'); end if;
  if old.languages_spoken is distinct from new.languages_spoken then changed_fields := array_append(changed_fields, 'languages_spoken'); end if;
  if old.emergency_contact_name is distinct from new.emergency_contact_name or old.emergency_contact_mobile is distinct from new.emergency_contact_mobile then
    changed_fields := array_append(changed_fields, 'emergency_contact');
  end if;

  if cardinality(changed_fields) > 0 then
    perform audit.write_event(
      'volunteer.private_profile_updated',
      'volunteer',
      new.volunteer_id::text,
      jsonb_build_object('changed_fields', changed_fields),
      auth.uid(),
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists volunteer_private_details_audit
  on public.volunteer_private_details;
create trigger volunteer_private_details_audit
after update on public.volunteer_private_details
for each row execute function audit.capture_volunteer_private_detail_change();

create table if not exists public.volunteer_shirt_skus (
  id uuid primary key default gen_random_uuid(),
  shirt_type text not null check (shirt_type in ('round_neck','collared')),
  size text not null check (size in ('S','M','L','XL','2XL','3XL','5XL','7XL')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (shirt_type, size)
);

create table if not exists public.volunteer_shirt_issuances (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null unique references core.volunteers(id) on delete restrict,
  sku_id uuid not null references public.volunteer_shirt_skus(id) on delete restrict,
  event_id uuid references public.phaseone_events(id) on delete set null,
  issuance_source text not null default 'event' check (
    issuance_source in ('event','admin','legacy')
  ),
  issued_at timestamptz not null default now(),
  issued_by uuid references core.user_accounts(id) on delete set null,
  note text check (note is null or char_length(note) <= 1000),
  created_at timestamptz not null default now()
);

create table if not exists public.volunteer_shirt_inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  sku_id uuid not null references public.volunteer_shirt_skus(id) on delete restrict,
  transaction_type text not null check (
    transaction_type in ('opening','receipt','adjustment','issue','return')
  ),
  quantity_delta integer not null check (quantity_delta <> 0),
  issuance_id uuid unique references public.volunteer_shirt_issuances(id) on delete restrict,
  reason text check (reason is null or char_length(reason) <= 1000),
  recorded_by uuid references core.user_accounts(id) on delete set null,
  recorded_at timestamptz not null default now(),
  constraint volunteer_shirt_issue_delta_check check (
    transaction_type <> 'issue' or quantity_delta = -1
  )
);

insert into public.volunteer_shirt_skus (shirt_type, size)
select shirt_type, size
from (
  values
    ('round_neck','S'),('round_neck','M'),('round_neck','L'),('round_neck','XL'),
    ('round_neck','2XL'),('round_neck','3XL'),('round_neck','5XL'),('round_neck','7XL'),
    ('collared','S'),('collared','M'),('collared','L'),('collared','XL'),
    ('collared','2XL'),('collared','3XL'),('collared','5XL'),('collared','7XL')
) as seed(shirt_type, size)
on conflict (shirt_type, size) do nothing;

alter table public.volunteer_shirt_skus enable row level security;
alter table public.volunteer_shirt_issuances enable row level security;
alter table public.volunteer_shirt_inventory_transactions enable row level security;

drop policy if exists "Authenticated users can read shirt catalogue"
  on public.volunteer_shirt_skus;
create policy "Authenticated users can read shirt catalogue"
on public.volunteer_shirt_skus
for select
to authenticated
using (true);

drop policy if exists "Volunteers can read their shirt issuance"
  on public.volunteer_shirt_issuances;
create policy "Volunteers can read their shirt issuance"
on public.volunteer_shirt_issuances
for select
to authenticated
using (
  exists (
    select 1
    from core.volunteers v
    where v.id = volunteer_shirt_issuances.volunteer_id
      and v.auth_user_id = auth.uid()
  )
);

drop policy if exists "Staff can read shirt issuances"
  on public.volunteer_shirt_issuances;
create policy "Staff can read shirt issuances"
on public.volunteer_shirt_issuances
for select
to authenticated
using (
  exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role in ('volunteer_leader','staff','volteam','admin')
  )
);

drop policy if exists "Inventory managers can read shirt transactions"
  on public.volunteer_shirt_inventory_transactions;
create policy "Inventory managers can read shirt transactions"
on public.volunteer_shirt_inventory_transactions
for select
to authenticated
using (
  exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = auth.uid()
      and a.status = 'active'
      and r.role in ('volteam','admin')
  )
);

grant select on public.volunteer_shirt_skus to authenticated;
grant select on public.volunteer_shirt_issuances to authenticated;
grant select on public.volunteer_shirt_inventory_transactions to authenticated;

create or replace view public.volunteer_shirt_stock
with (security_invoker = true)
as
select
  sku.id as sku_id,
  sku.shirt_type,
  sku.size,
  coalesce(sum(tx.quantity_delta), 0)::integer as quantity_on_hand,
  sku.active
from public.volunteer_shirt_skus sku
left join public.volunteer_shirt_inventory_transactions tx
  on tx.sku_id = sku.id
group by sku.id, sku.shirt_type, sku.size, sku.active;

grant select on public.volunteer_shirt_stock to authenticated;

create or replace function public.record_volunteer_shirt_stock(
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
  actor_id uuid := auth.uid();
  sku public.volunteer_shirt_skus%rowtype;
  current_quantity integer;
  transaction_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
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

create or replace function public.issue_volunteer_shirt(
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
  actor_id uuid := auth.uid();
  sku public.volunteer_shirt_skus%rowtype;
  current_quantity integer;
  issuance_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts a
    join core.user_roles r on r.user_id = a.id
    where a.id = actor_id
      and a.status = 'active'
      and r.role in ('volunteer_leader','staff','volteam','admin')
  ) then
    raise exception 'Event operations access is required' using errcode = '42501';
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

create or replace function public.mark_previous_volunteer_shirt_issue(
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
  actor_id uuid := auth.uid();
  sku_id uuid;
  issuance_id uuid;
begin
  if actor_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
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

revoke all on function public.record_volunteer_shirt_stock(text,text,integer,text,text)
  from public, anon, authenticated;
grant execute on function public.record_volunteer_shirt_stock(text,text,integer,text,text)
  to authenticated, service_role;

revoke all on function public.issue_volunteer_shirt(uuid,text,text,uuid,text)
  from public, anon, authenticated;
grant execute on function public.issue_volunteer_shirt(uuid,text,text,uuid,text)
  to authenticated, service_role;

revoke all on function public.mark_previous_volunteer_shirt_issue(uuid,text,text,timestamptz,text)
  from public, anon, authenticated;
grant execute on function public.mark_previous_volunteer_shirt_issue(uuid,text,text,timestamptz,text)
  to authenticated, service_role;

commit;
