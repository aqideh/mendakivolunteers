insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'programme-rundowns',
  'programme-rundowns',
  true,
  5242880,
  array['image/jpeg', 'image/png', 'image/webp']::text[]
)
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create table if not exists public.phaseone_event_rundown_images (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  storage_path text not null,
  original_file_name text,
  sort_order integer not null default 0 check (sort_order >= 0),
  created_at timestamptz not null default now(),
  unique (event_id, storage_path)
);

create index if not exists phaseone_event_rundown_images_event_order_idx
  on public.phaseone_event_rundown_images (event_id, sort_order, created_at);

alter table public.phaseone_event_rundown_images enable row level security;

revoke all on table public.phaseone_event_rundown_images from anon, authenticated;

comment on table public.phaseone_event_rundown_images is
  'Ordered Supabase Storage images shown in an event programme rundown.';
comment on column public.phaseone_event_rundown_images.storage_path is
  'Object path in the programme-rundowns Storage bucket.';
