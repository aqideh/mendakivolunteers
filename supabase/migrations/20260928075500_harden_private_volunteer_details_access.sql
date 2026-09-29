begin;

drop policy if exists "Event managers can read private volunteer details"
  on public.volunteer_private_details;
drop policy if exists "Staff can read private volunteer details"
  on public.volunteer_private_details;
drop policy if exists "Volunteer team can read private volunteer details"
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
    where a.id = (select auth.uid())
      and a.status = 'active'
      and r.role::text in ('volteam', 'admin')
  )
);

commit;
