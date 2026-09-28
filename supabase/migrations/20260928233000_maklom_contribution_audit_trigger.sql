begin;

create or replace function maklom_private.audit_volunteer_contribution()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'INSERT'
     or old.status is distinct from new.status
     or old.approved_minutes is distinct from new.approved_minutes then
    insert into public.volunteer_contribution_audit (
      contribution_id,
      old_status,
      new_status,
      old_approved_minutes,
      new_approved_minutes,
      changed_by
    ) values (
      new.id,
      case when tg_op = 'INSERT' then null else old.status end,
      new.status,
      case when tg_op = 'INSERT' then null else old.approved_minutes end,
      new.approved_minutes,
      auth.uid()
    );
  end if;
  return null;
end;
$$;

revoke all on function maklom_private.audit_volunteer_contribution()
from public, anon, authenticated;

drop trigger if exists volunteer_contributions_audit
on public.volunteer_contributions;

create trigger volunteer_contributions_audit
after insert or update on public.volunteer_contributions
for each row execute function maklom_private.audit_volunteer_contribution();

drop function if exists public.audit_volunteer_contribution();

comment on function maklom_private.audit_volunteer_contribution() is
  'Internal trigger-only audit writer for MakLom contribution review. Runs with table-owner privileges so authenticated editors cannot forge audit rows directly but legitimate review updates always append audit history.';

commit;
