begin;

alter table core.volunteers
  add column if not exists profile_photo_path text,
  add column if not exists profile_photo_updated_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'volunteers_profile_photo_path_format'
      and conrelid = 'core.volunteers'::regclass
  ) then
    alter table core.volunteers
      add constraint volunteers_profile_photo_path_format
      check (
        profile_photo_path is null
        or profile_photo_path ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
      );
  end if;
end;
$$;

create or replace function core.set_current_volunteer_profile_photo(
  p_storage_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, core, audit
as $$
declare
  current_user_id uuid := auth.uid();
  volunteer_id uuid;
  previous_path text;
  clean_storage_path text := nullif(btrim(coalesce(p_storage_path, '')), '');
  changed_at timestamptz;
begin
  if current_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  if not core.is_current_account_active() then
    raise exception 'An active KELUARGA account is required' using errcode = '42501';
  end if;

  select volunteers.id, volunteers.profile_photo_path
  into volunteer_id, previous_path
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  for update;

  if volunteer_id is null then
    raise exception 'Volunteer profile is unavailable' using errcode = 'P0002';
  end if;

  if clean_storage_path is not null and (
    split_part(clean_storage_path, '/', 1) <> volunteer_id::text
    or clean_storage_path !~ '^[0-9a-f-]{36}/[0-9a-f-]{36}\.webp$'
  ) then
    raise exception 'Invalid profile photo storage path' using errcode = '22023';
  end if;

  update core.volunteers
  set
    profile_photo_path = clean_storage_path,
    profile_photo_updated_at = case when clean_storage_path is null then null else now() end
  where id = volunteer_id
  returning updated_at into changed_at;

  perform audit.write_event(
    'volunteer.profile_photo_updated',
    'volunteer',
    volunteer_id::text,
    jsonb_build_object(
      'had_previous_photo', previous_path is not null,
      'has_profile_photo', clean_storage_path is not null
    ),
    current_user_id,
    null
  );

  return jsonb_build_object(
    'volunteer_id', volunteer_id,
    'previous_storage_path', previous_path,
    'profile_photo_path', clean_storage_path,
    'updated_at', changed_at
  );
end;
$$;

comment on column core.volunteers.profile_photo_path is
  'Private Supabase Storage object path for the volunteer profile photo.';
comment on column core.volunteers.profile_photo_updated_at is
  'Timestamp when the current profile photo was attached.';
comment on function core.set_current_volunteer_profile_photo(text) is
  'Attaches or removes the authenticated active volunteer profile photo and records an audit event.';

revoke all on function core.set_current_volunteer_profile_photo(text)
  from public, anon, authenticated;
grant execute on function core.set_current_volunteer_profile_photo(text)
  to authenticated, service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('profile-photos', 'profile-photos', false, 524288, array['image/webp']::text[]),
  ('event-images', 'event-images', true, 1048576, array['image/webp']::text[])
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
