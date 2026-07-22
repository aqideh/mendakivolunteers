begin;

create table core.staff_password_setup_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references core.user_accounts (id) on delete cascade,
  token_hash text not null unique check (
    token_hash ~ '^[0-9a-f]{64}$'
  ),
  created_by uuid not null references core.user_accounts (id) on delete restrict,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  revoked_at timestamptz,
  revoked_by uuid references core.user_accounts (id) on delete set null,
  constraint staff_password_setup_expiry_after_creation check (
    expires_at > created_at
  ),
  constraint staff_password_setup_terminal_state check (
    num_nonnulls(consumed_at, revoked_at) <= 1
  ),
  constraint staff_password_setup_revoker_consistent check (
    (revoked_at is null and revoked_by is null)
    or (revoked_at is not null and revoked_by is not null)
  )
);

comment on table core.staff_password_setup_tokens is
  'Server-only, single-use staff password setup tokens. Only SHA-256 token hashes are stored.';
comment on column core.staff_password_setup_tokens.token_hash is
  'Lowercase hexadecimal SHA-256 digest of the raw one-time token.';

create index staff_password_setup_tokens_user_time_idx
  on core.staff_password_setup_tokens (user_id, created_at desc);

create unique index staff_password_setup_tokens_one_active_per_user_idx
  on core.staff_password_setup_tokens (user_id)
  where consumed_at is null and revoked_at is null;

alter table core.staff_password_setup_tokens enable row level security;
alter table core.staff_password_setup_tokens force row level security;

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
    join core.user_roles as roles
      on roles.user_id = accounts.id
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
    join core.user_roles as roles
      on roles.user_id = accounts.id
    where accounts.id = p_user_id
      and accounts.status in ('pending_link', 'active')
      and roles.role in ('attendance_manager', 'admin')
  ) then
    raise exception 'Password setup links are limited to active staff accounts'
      using errcode = '42501';
  end if;

  update core.staff_password_setup_tokens
  set
    revoked_at = now(),
    revoked_by = p_created_by
  where user_id = p_user_id
    and consumed_at is null
    and revoked_at is null;

  insert into core.staff_password_setup_tokens (
    user_id,
    token_hash,
    created_by,
    expires_at
  )
  values (
    p_user_id,
    p_token_hash,
    p_created_by,
    p_expires_at
  )
  returning id into issued_token_id;

  return issued_token_id;
end;
$$;

create or replace function core.consume_staff_password_setup_token(
  p_token_hash text
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, core
as $$
declare
  matched_user_id uuid;
begin
  update core.staff_password_setup_tokens
  set consumed_at = now()
  where token_hash = p_token_hash
    and consumed_at is null
    and revoked_at is null
    and expires_at > now()
  returning user_id into matched_user_id;

  return matched_user_id;
end;
$$;

create or replace function audit.capture_staff_password_setup_token_change()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, audit
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.write_event(
      'staff_password_setup.issued',
      'user_account',
      new.user_id::text,
      jsonb_build_object('expires_at', new.expires_at),
      new.created_by,
      null
    );
    return new;
  end if;

  if old.revoked_at is null and new.revoked_at is not null then
    perform audit.write_event(
      'staff_password_setup.revoked',
      'user_account',
      new.user_id::text,
      jsonb_build_object('token_id', new.id),
      new.revoked_by,
      null
    );
  end if;

  if old.consumed_at is null and new.consumed_at is not null then
    perform audit.write_event(
      'staff_password_setup.consumed',
      'user_account',
      new.user_id::text,
      jsonb_build_object('token_id', new.id),
      new.user_id,
      null
    );
  end if;

  return new;
end;
$$;

create trigger staff_password_setup_tokens_audit
after insert or update on core.staff_password_setup_tokens
for each row execute function audit.capture_staff_password_setup_token_change();

revoke all on core.staff_password_setup_tokens from public, anon, authenticated;
revoke all on function core.issue_staff_password_setup_token(uuid, text, uuid, timestamptz)
  from public, anon, authenticated;
revoke all on function core.consume_staff_password_setup_token(text)
  from public, anon, authenticated;
revoke all on function audit.capture_staff_password_setup_token_change()
  from public, anon, authenticated;

grant all on core.staff_password_setup_tokens to service_role;
grant execute on function core.issue_staff_password_setup_token(uuid, text, uuid, timestamptz)
  to service_role;
grant execute on function core.consume_staff_password_setup_token(text)
  to service_role;
grant execute on function audit.capture_staff_password_setup_token_change()
  to service_role;

commit;
