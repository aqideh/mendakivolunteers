begin;

create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  is_staff_invite boolean :=
    coalesce(new.raw_user_meta_data ->> 'staff_invite', 'false') = 'true';
  clean_name text :=
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');
  clean_email text := nullif(lower(btrim(coalesce(new.email, ''))), '');
  volunteer_id uuid;
begin
  insert into core.user_accounts (id, status, display_name)
  values (
    new.id,
    case when is_staff_invite then 'pending_link'::core.account_status
         else 'active'::core.account_status
    end,
    clean_name
  )
  on conflict (id) do nothing;

  if not is_staff_invite then
    insert into core.user_roles (user_id, role, reason)
    values (new.id, 'volunteer', 'Default role assigned at volunteer account creation')
    on conflict (user_id, role) do nothing;

    insert into core.volunteers (
      auth_user_id,
      display_name,
      primary_email_normalized
    )
    values (
      new.id,
      clean_name,
      clean_email
    )
    on conflict (auth_user_id) do nothing
    returning id into volunteer_id;
  end if;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object(
      'account_kind', case when is_staff_invite then 'staff_invite' else 'volunteer' end,
      'volunteer_created', volunteer_id is not null
    ),
    new.id,
    null
  );

  return new;
end;
$$;

create or replace function core.ensure_current_keluarga_volunteer()
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core, auth, audit
as $$
declare
  current_user_id uuid := auth.uid();
  current_status core.account_status;
  current_display_name text;
  current_email text;
  is_staff_invite boolean;
  volunteer_id uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select
    accounts.status,
    accounts.display_name,
    nullif(lower(btrim(coalesce(users.email, ''))), ''),
    coalesce(users.raw_user_meta_data ->> 'staff_invite', 'false') = 'true'
  into
    current_status,
    current_display_name,
    current_email,
    is_staff_invite
  from core.user_accounts as accounts
  join auth.users as users on users.id = accounts.id
  where accounts.id = current_user_id
  for update of accounts;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = 'P0002';
  end if;

  if current_status in ('suspended', 'closed') then
    raise exception 'KELUARGA account is inactive' using errcode = '42501';
  end if;

  if is_staff_invite then
    raise exception 'Staff-only accounts are not automatically converted into volunteer records'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_roles
    where user_id = current_user_id
      and role = 'volunteer'
  ) then
    raise exception 'Volunteer access is required' using errcode = '42501';
  end if;

  select id
  into volunteer_id
  from core.volunteers
  where auth_user_id = current_user_id
  for update;

  if volunteer_id is null then
    insert into core.volunteers (
      auth_user_id,
      display_name,
      primary_email_normalized
    )
    values (
      current_user_id,
      current_display_name,
      current_email
    )
    on conflict (auth_user_id) do nothing;

    select id
    into volunteer_id
    from core.volunteers
    where auth_user_id = current_user_id;

    perform audit.write_event(
      'volunteer.profile_created',
      'volunteer',
      volunteer_id::text,
      jsonb_build_object('source', 'keluarga_self_service'),
      current_user_id,
      null
    );
  end if;

  if current_status = 'pending_link' then
    update core.user_accounts
    set status = 'active'
    where id = current_user_id;
  end if;

  return volunteer_id;
end;
$$;

revoke all on function core.ensure_current_keluarga_volunteer()
  from public, anon, authenticated;
grant execute on function core.ensure_current_keluarga_volunteer()
  to authenticated, service_role;

-- Repair existing KELUARGA-native volunteer accounts created under the former
-- "pending external link" model. Staff invitations remain account-only.
insert into core.volunteers (
  auth_user_id,
  display_name,
  primary_email_normalized
)
select
  accounts.id,
  accounts.display_name,
  nullif(lower(btrim(coalesce(users.email, ''))), '')
from core.user_accounts as accounts
join auth.users as users on users.id = accounts.id
where accounts.status = 'pending_link'
  and coalesce(users.raw_user_meta_data ->> 'staff_invite', 'false') <> 'true'
  and exists (
    select 1
    from core.user_roles as roles
    where roles.user_id = accounts.id
      and roles.role = 'volunteer'
  )
  and not exists (
    select 1
    from core.volunteers as volunteers
    where volunteers.auth_user_id = accounts.id
  )
on conflict (auth_user_id) do nothing;

update core.user_accounts as accounts
set status = 'active'
from auth.users as users
where users.id = accounts.id
  and accounts.status = 'pending_link'
  and coalesce(users.raw_user_meta_data ->> 'staff_invite', 'false') <> 'true'
  and exists (
    select 1
    from core.volunteers as volunteers
    where volunteers.auth_user_id = accounts.id
  );

delete from core.user_roles as roles
using auth.users as users
where users.id = roles.user_id
  and roles.role = 'volunteer'
  and coalesce(users.raw_user_meta_data ->> 'staff_invite', 'false') = 'true'
  and not exists (
    select 1
    from core.volunteers as volunteers
    where volunteers.auth_user_id = roles.user_id
  );

commit;
