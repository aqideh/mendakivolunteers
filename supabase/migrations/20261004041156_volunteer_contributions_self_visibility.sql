drop policy if exists volunteer_contributions_select_self_approved
  on public.volunteer_contributions;

drop policy if exists volunteer_contributions_select_self
  on public.volunteer_contributions;

create policy volunteer_contributions_select_self
on public.volunteer_contributions
for select
to authenticated
using (
  (select auth.uid()) is not null
  and volunteer_id = (select core.current_volunteer_id())
);

comment on policy volunteer_contributions_select_self
on public.volunteer_contributions
is 'Volunteers may read their own contribution history in all review states. Only approved contributions count toward credited hours, points, and badges.';
