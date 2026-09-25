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
    case
      when is_staff_invite then 'pending_link'::core.account_status
      else 'active'::core.account_status
    end,
    clean_name
  )
  on conflict (id) do nothing;

  if not is_staff_invite then
    insert into core.user_roles (user_id, role, reason)
    values (
      new.id,
      'volunteer',
      'Default role assigned at volunteer account creation'
    )
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
      'account_kind',
      case when is_staff_invite then 'staff_invite' else 'volunteer' end,
      'volunteer_created',
      volunteer_id is not null
    ),
    new.id,
    null
  );

  return new;
end;
$$;

commit;
