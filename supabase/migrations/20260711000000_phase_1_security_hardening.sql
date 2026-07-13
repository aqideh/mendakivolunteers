begin;

create or replace function core.is_current_account_active()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_accounts
    where id = auth.uid()
      and status = 'active'
  );
$$;

create or replace function core.has_role(required_role core.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_roles as roles
    join core.user_accounts as accounts
      on accounts.id = roles.user_id
    where roles.user_id = auth.uid()
      and roles.role = required_role
      and accounts.status = 'active'
  );
$$;

create or replace function core.can_support_volunteers()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_roles as roles
    join core.user_accounts as accounts
      on accounts.id = roles.user_id
    where roles.user_id = auth.uid()
      and roles.role in ('support_officer', 'auditor', 'admin')
      and accounts.status = 'active'
  );
$$;

create or replace function core.prevent_ymhub_volunteer_id_change()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  if old.ymhub_volunteer_id is distinct from new.ymhub_volunteer_id then
    raise exception 'YM Hub volunteer ID is immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

drop policy volunteers_select_self on core.volunteers;

create policy volunteers_select_self
on core.volunteers
for select
to authenticated
using (
  auth_user_id = auth.uid()
  and core.is_current_account_active()
);

create trigger volunteers_prevent_external_id_change
before update of ymhub_volunteer_id on core.volunteers
for each row execute function core.prevent_ymhub_volunteer_id_change();

revoke all on function core.is_current_account_active()
  from public, anon, authenticated;
revoke all on function core.prevent_ymhub_volunteer_id_change()
  from public, anon, authenticated;

grant execute on function core.is_current_account_active()
  to authenticated, service_role;
grant execute on function core.has_role(core.app_role)
  to authenticated, service_role;
grant execute on function core.can_support_volunteers()
  to authenticated, service_role;

commit;
