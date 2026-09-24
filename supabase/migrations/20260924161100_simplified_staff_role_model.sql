begin;

do $guard$
declare
  legacy_assignments integer;
begin
  select count(*)::integer
  into legacy_assignments
  from core.user_roles
  where role in (
    'support_officer',
    'content_editor',
    'pathway_manager',
    'publisher',
    'attendance_manager',
    'programme_manager',
    'gamification_manager',
    'auditor'
  );

  if legacy_assignments > 0 then
    raise exception
      'Legacy KELUARGA staff role assignments must be manually reviewed before applying the simplified role model';
  end if;
end;
$guard$;

create or replace function core.has_role(required_role core.app_role)
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_roles
    where user_id = auth.uid()
      and (
        role = required_role
        or (
          required_role in (
            'support_officer',
            'content_editor',
            'pathway_manager',
            'publisher',
            'programme_manager',
            'gamification_manager'
          )
          and role in ('volteam', 'admin')
        )
        or (
          required_role = 'attendance_manager'
          and role in ('staff', 'volteam', 'admin')
        )
        or (
          required_role = 'auditor'
          and role = 'admin'
        )
      )
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
      and roles.role in ('volteam', 'admin')
      and accounts.status = 'active'
  );
$$;

create or replace function pathways.is_manager()
returns boolean
language sql
stable
security definer
set search_path = pg_catalog, core
as $$
  select exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles
      on roles.user_id = accounts.id
    where accounts.id = auth.uid()
      and accounts.status = 'active'
      and roles.role in ('volteam', 'admin')
  );
$$;

create or replace function core.activate_current_staff_account()
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  current_user_id uuid := auth.uid();
  current_status core.account_status;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select status into current_status
  from core.user_accounts
  where id = current_user_id
  for update;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    raise exception 'KELUARGA account is inactive' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_roles
    where user_id = current_user_id
      and role in ('volunteer_leader', 'staff', 'volteam', 'admin')
  ) then
    return 'not_staff';
  end if;

  if current_status = 'active' then
    return 'already_active';
  end if;

  update core.user_accounts
  set status = 'active'
  where id = current_user_id;

  perform audit.write_event(
    'staff_account.activated',
    'user_account',
    current_user_id::text,
    jsonb_build_object('source', 'authenticated_setup'),
    current_user_id,
    null
  );

  return 'activated';
end;
$$;

create or replace function core.activate_staff_account_after_setup(p_user_id uuid)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  target_status core.account_status;
begin
  select status into target_status
  from core.user_accounts
  where id = p_user_id
  for update;

  if target_status is null then
    raise exception 'KELUARGA account is unavailable' using errcode = 'P0002';
  end if;

  if target_status in ('suspended', 'closed') then
    raise exception 'KELUARGA account is inactive' using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_roles
    where user_id = p_user_id
      and role in ('volunteer_leader', 'staff', 'volteam', 'admin')
  ) then
    raise exception 'Staff role is required' using errcode = '42501';
  end if;

  if target_status = 'active' then
    return 'already_active';
  end if;

  update core.user_accounts
  set status = 'active'
  where id = p_user_id;

  perform audit.write_event(
    'staff_account.activated',
    'user_account',
    p_user_id::text,
    jsonb_build_object('source', 'setup_token'),
    p_user_id,
    null
  );

  return 'activated';
end;
$$;

create or replace function core.issue_staff_password_setup_token(
  p_user_id uuid,
  p_token_hash text,
  p_created_by uuid,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core
as $$
declare
  issued_token_id uuid;
begin
  if p_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Password setup token hash is invalid'
      using errcode = '22023';
  end if;

  if p_expires_at <= now() or p_expires_at > now() + interval '24 hours' then
    raise exception 'Password setup token expiry is invalid'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles on roles.user_id = accounts.id
    where accounts.id = p_created_by
      and accounts.status = 'active'
      and roles.role = 'admin'
  ) then
    raise exception 'Only active administrators can issue staff password setup links'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from core.user_accounts as accounts
    join core.user_roles as roles on roles.user_id = accounts.id
    where accounts.id = p_user_id
      and accounts.status in ('pending_link', 'active')
      and roles.role in ('volunteer_leader', 'staff', 'volteam', 'admin')
  ) then
    raise exception 'Password setup links are limited to staff accounts'
      using errcode = '42501';
  end if;

  update core.staff_password_setup_tokens
  set revoked_at = now(), revoked_by = p_created_by
  where user_id = p_user_id
    and consumed_at is null
    and revoked_at is null;

  insert into core.staff_password_setup_tokens (
    user_id, token_hash, created_by, expires_at
  ) values (
    p_user_id, p_token_hash, p_created_by, p_expires_at
  )
  returning id into issued_token_id;

  return issued_token_id;
end;
$$;

create or replace function core.set_staff_access_level(
  p_user_id uuid,
  p_role core.app_role,
  p_granted_by uuid
)
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, public
as $$
declare
  target_status core.account_status;
  target_is_admin boolean;
  active_other_admins integer;
begin
  if p_role not in ('volunteer_leader', 'staff', 'volteam', 'admin') then
    raise exception 'Unsupported KELUARGA staff role' using errcode = '22023';
  end if;

  if not exists (
    select 1
    from core.user_accounts accounts
    join core.user_roles roles on roles.user_id = accounts.id
    where accounts.id = p_granted_by
      and accounts.status = 'active'
      and roles.role = 'admin'
  ) then
    raise exception 'Administrator authorization is required' using errcode = '42501';
  end if;

  select status into target_status
  from core.user_accounts
  where id = p_user_id
  for update;

  if target_status is null then
    raise exception 'Staff account could not be found' using errcode = 'P0002';
  end if;

  if target_status in ('suspended', 'closed') then
    raise exception 'Inactive staff accounts cannot be assigned access' using errcode = '42501';
  end if;

  select exists (
    select 1 from core.user_roles
    where user_id = p_user_id and role = 'admin'
  ) into target_is_admin;

  if target_is_admin and p_role <> 'admin' then
    select count(*)::integer into active_other_admins
    from core.user_roles roles
    join core.user_accounts accounts on accounts.id = roles.user_id
    where roles.role = 'admin'
      and roles.user_id <> p_user_id
      and accounts.status = 'active';

    if active_other_admins = 0 then
      raise exception 'KELUARGA must retain at least one active administrator'
        using errcode = '42501';
    end if;
  end if;

  delete from core.user_roles
  where user_id = p_user_id
    and role in (
      'support_officer',
      'content_editor',
      'pathway_manager',
      'publisher',
      'attendance_manager',
      'programme_manager',
      'gamification_manager',
      'auditor',
      'volunteer_leader',
      'staff',
      'volteam',
      'admin'
    );

  insert into core.user_roles (
    user_id, role, granted_by, reason
  ) values (
    p_user_id,
    p_role,
    p_granted_by,
    'Staff access level set through KELUARGA administration'
  );

  if p_role = 'admin' then
    insert into public.app_members (user_id, role, active)
    values (p_user_id, 'admin', true)
    on conflict (user_id) do update
      set role = 'admin',
          active = true,
          updated_at = now();
  else
    delete from public.app_members
    where user_id = p_user_id;
  end if;

  return p_role::text;
end;
$$;

revoke all on function core.set_staff_access_level(uuid, core.app_role, uuid)
  from public, anon, authenticated;
grant execute on function core.set_staff_access_level(uuid, core.app_role, uuid)
  to service_role;

do $compatibility$
declare
  function_definition text;
begin
  for function_definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname in (
        'review_keluarga_registration',
        'cancel_keluarga_registration',
        'refresh_manual_event_contribution_credits'
      )
      and p.prokind = 'f'
  loop
    execute replace(
      function_definition,
      $old$roles.role in ('attendance_manager', 'admin')$old$,
      $new$roles.role in ('staff', 'volteam', 'admin')$new$
    );
  end loop;

  for function_definition in
    select pg_get_functiondef(p.oid)
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'core'
      and p.proname = 'review_keluarga_recruitment_application'
      and p.prokind = 'f'
  loop
    execute replace(
      function_definition,
      $old$roles.role in ('support_officer', 'admin')$old$,
      $new$roles.role in ('volteam', 'admin')$new$
    );
  end loop;
end;
$compatibility$;

drop policy if exists user_roles_select_audit_or_admin on core.user_roles;
drop policy if exists user_roles_select_admin on core.user_roles;
create policy user_roles_select_admin
on core.user_roles
for select
to authenticated
using (core.has_role('admin'::core.app_role));

drop policy if exists point_ledger_select_authorized
  on gamification.point_ledger_entries;
create policy point_ledger_select_authorized
on gamification.point_ledger_entries
for select
to authenticated
using (
  volunteer_id = (select core.current_volunteer_id())
  or (select core.can_support_volunteers())
);

drop policy if exists point_rules_select_authorized
  on gamification.point_rules;
create policy point_rules_select_authorized
on gamification.point_rules
for select
to authenticated
using (
  status in (
    'active'::gamification.point_rule_status,
    'retired'::gamification.point_rule_status
  )
  or (select core.can_support_volunteers())
);

insert into public.app_members (user_id, role, active)
select roles.user_id, 'admin', true
from core.user_roles roles
join core.user_accounts accounts on accounts.id = roles.user_id
where roles.role = 'admin'
  and accounts.status in ('pending_link', 'active')
on conflict (user_id) do update
set role = 'admin',
    active = true,
    updated_at = now();

commit;
