begin;

drop policy if exists "Staff can read private volunteer details"
  on public.volunteer_private_details;
create policy "Volunteer team can read private volunteer details"
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
      and r.role in ('volteam','admin')
  )
);

drop policy if exists "Staff can read shirt issuances"
  on public.volunteer_shirt_issuances;
create policy "Volunteer team can read shirt issuances"
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
      and r.role in ('volteam','admin')
  )
);

create index if not exists volunteer_shirt_issuances_sku_idx
  on public.volunteer_shirt_issuances(sku_id);

create index if not exists volunteer_shirt_issuances_event_idx
  on public.volunteer_shirt_issuances(event_id)
  where event_id is not null;

create index if not exists volunteer_shirt_issuances_issued_by_idx
  on public.volunteer_shirt_issuances(issued_by)
  where issued_by is not null;

create index if not exists volunteer_shirt_inventory_transactions_sku_idx
  on public.volunteer_shirt_inventory_transactions(sku_id);

create index if not exists volunteer_shirt_inventory_transactions_recorded_by_idx
  on public.volunteer_shirt_inventory_transactions(recorded_by)
  where recorded_by is not null;

create index if not exists volunteer_private_details_planning_area_idx
  on public.volunteer_private_details(planning_area)
  where planning_area is not null;

create index if not exists volunteer_private_details_electoral_division_idx
  on public.volunteer_private_details(electoral_division)
  where electoral_division is not null;

create index if not exists volunteer_private_details_tshirt_size_idx
  on public.volunteer_private_details(tshirt_size)
  where tshirt_size is not null;

commit;
