begin;

create or replace function core.update_current_volunteer_profile(
  p_display_name text,
  p_mobile text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  current_user_id uuid := auth.uid();
  volunteer_id uuid;
  clean_display_name text := nullif(btrim(p_display_name), '');
  clean_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  changed_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    raise exception 'An active KELUARGA account is required' using errcode = '42501';
  end if;

  if clean_display_name is null or char_length(clean_display_name) > 120 then
    raise exception 'Enter a valid full name' using errcode = '22023';
  end if;

  if clean_mobile is not null and (
    char_length(clean_mobile) < 7
    or char_length(clean_mobile) > 40
    or clean_mobile !~ '^[0-9+() .-]+$'
  ) then
    raise exception 'Enter a valid mobile number' using errcode = '22023';
  end if;

  select volunteers.id
  into volunteer_id
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  for update;

  if volunteer_id is null then
    raise exception 'Volunteer profile is unavailable' using errcode = 'P0002';
  end if;

  update core.user_accounts
  set display_name = clean_display_name
  where id = current_user_id;

  update core.volunteers
  set
    display_name = clean_display_name,
    mobile = clean_mobile
  where id = volunteer_id
  returning updated_at into changed_at;

  perform audit.write_event(
    'volunteer.profile_updated',
    'volunteer',
    volunteer_id::text,
    jsonb_build_object(
      'changed_fields',
      jsonb_build_array('display_name', 'mobile')
    ),
    current_user_id,
    null
  );

  return jsonb_build_object(
    'display_name', clean_display_name,
    'mobile', clean_mobile,
    'updated_at', changed_at
  );
end;
$$;

comment on function core.update_current_volunteer_profile(text, text) is
  'Updates the authenticated active volunteer''s app-owned name and mobile fields atomically and records an audit event.';

revoke all on function core.update_current_volunteer_profile(text, text)
  from public, anon, authenticated;
grant execute on function core.update_current_volunteer_profile(text, text)
  to authenticated, service_role;

commit;
