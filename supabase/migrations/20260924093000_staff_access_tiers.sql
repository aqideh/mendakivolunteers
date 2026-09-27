begin;

alter type core.app_role
  add value if not exists 'programme_manager' after 'attendance_manager';

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
      and role in (
        'support_officer',
        'content_editor',
        'pathway_manager',
        'publisher',
        'attendance_manager',
        'programme_manager',
        'gamification_manager',
        'auditor',
        'admin'
      )
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
      and role in (
        'support_officer',
        'content_editor',
        'pathway_manager',
        'publisher',
        'attendance_manager',
        'programme_manager',
        'gamification_manager',
        'auditor',
        'admin'
      )
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
      and roles.role in (
        'support_officer',
        'content_editor',
        'pathway_manager',
        'publisher',
        'attendance_manager',
        'programme_manager',
        'gamification_manager',
        'auditor',
        'admin'
      )
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

commit;
