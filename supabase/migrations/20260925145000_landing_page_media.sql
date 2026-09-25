begin;

create table if not exists content.landing_page_media (
  page_key text primary key,
  label text not null,
  image_url text not null,
  storage_path text,
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint landing_page_media_page_key_check
    check (
      page_key in (
        'home',
        'coach',
        'facilitator',
        'mentor',
        'specialist',
        'contributor'
      )
    )
);

alter table content.landing_page_media enable row level security;

drop policy if exists "Landing page media is publicly readable"
  on content.landing_page_media;

create policy "Landing page media is publicly readable"
  on content.landing_page_media
  for select
  to anon, authenticated
  using (true);

grant usage on schema content to anon, authenticated, service_role;
revoke all on table content.landing_page_media from anon, authenticated;
grant select on table content.landing_page_media to anon, authenticated;
grant all on table content.landing_page_media to service_role;

insert into content.landing_page_media (
  page_key,
  label,
  image_url,
  storage_path
)
values
  ('home', 'Home', '/home/keluarga-volunteers-hero.jpeg', null),
  ('coach', 'Coach', '/volunteer/coach-hero.jpg', null),
  ('facilitator', 'Facilitator', '/volunteer/facilitator-hero.jpg', null),
  ('mentor', 'Mentor', '/volunteer/mentor/mendaki-ampowered.png', null),
  ('specialist', 'Professional', '/home/keluarga-volunteers-hero.jpeg', null),
  ('contributor', 'Contributor', '/home/keluarga-volunteers-hero.jpeg', null)
on conflict (page_key) do update
set label = excluded.label;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
)
values (
  'landing-page-images',
  'landing-page-images',
  true,
  1048576,
  array['image/webp']::text[]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

commit;
