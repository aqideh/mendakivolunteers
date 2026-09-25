begin;

create table if not exists public.keluarga_volunteer_profiles (
  volunteer_id uuid primary key references core.volunteers (id) on delete cascade,
  avatar_path text,
  bio text,
  interests text[] not null default '{}'::text[],
  skills text[] not null default '{}'::text[],
  availability_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint keluarga_volunteer_profiles_avatar_path_check check (
    avatar_path is null
    or (
      char_length(avatar_path) between 1 and 300
      and avatar_path !~ '(^|/)\.\.(/|$)'
    )
  ),
  constraint keluarga_volunteer_profiles_bio_check check (
    bio is null or char_length(bio) <= 500
  ),
  constraint keluarga_volunteer_profiles_interests_check check (
    cardinality(interests) <= 12
  ),
  constraint keluarga_volunteer_profiles_skills_check check (
    cardinality(skills) <= 12
  ),
  constraint keluarga_volunteer_profiles_availability_check check (
    availability_notes is null or char_length(availability_notes) <= 800
  )
);

comment on table public.keluarga_volunteer_profiles is
  'Volunteer-controlled KELUARGA presentation profile. This is not the MakLom-managed longitudinal profile.';

create trigger keluarga_volunteer_profiles_set_updated_at
before update on public.keluarga_volunteer_profiles
for each row execute function core.set_updated_at();

alter table public.keluarga_volunteer_profiles enable row level security;

create policy "Volunteers can read their KELUARGA profile"
on public.keluarga_volunteer_profiles
for select
to authenticated
using (
  exists (
    select 1
    from core.volunteers as volunteer
    where volunteer.id = keluarga_volunteer_profiles.volunteer_id
      and volunteer.auth_user_id = auth.uid()
  )
);

create policy "Volunteers can create their KELUARGA profile"
on public.keluarga_volunteer_profiles
for insert
to authenticated
with check (
  exists (
    select 1
    from core.volunteers as volunteer
    where volunteer.id = keluarga_volunteer_profiles.volunteer_id
      and volunteer.auth_user_id = auth.uid()
  )
);

create policy "Volunteers can update their KELUARGA profile"
on public.keluarga_volunteer_profiles
for update
to authenticated
using (
  exists (
    select 1
    from core.volunteers as volunteer
    where volunteer.id = keluarga_volunteer_profiles.volunteer_id
      and volunteer.auth_user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from core.volunteers as volunteer
    where volunteer.id = keluarga_volunteer_profiles.volunteer_id
      and volunteer.auth_user_id = auth.uid()
  )
);

grant select, insert, update on public.keluarga_volunteer_profiles to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'volunteer-profile-photos',
  'volunteer-profile-photos',
  false,
  2097152,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create policy "Volunteers can read their profile photos"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'volunteer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Volunteers can upload their profile photos"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'volunteer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Volunteers can replace their profile photos"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'volunteer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
)
with check (
  bucket_id = 'volunteer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

create policy "Volunteers can remove their profile photos"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'volunteer-profile-photos'
  and (storage.foldername(name))[1] = auth.uid()::text
);

commit;
