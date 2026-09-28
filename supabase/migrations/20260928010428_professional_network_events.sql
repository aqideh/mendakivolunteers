begin;

create table if not exists content.professional_events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(title) between 3 and 140),
  summary text not null check (char_length(summary) between 10 and 600),
  starts_at timestamptz,
  ends_at timestamptz,
  venue text check (venue is null or char_length(venue) between 2 and 180),
  cta_label text not null default 'Register' check (char_length(cta_label) between 2 and 40),
  is_published boolean not null default false,
  sort_order integer not null default 0 check (sort_order between -1000 and 1000),
  created_by uuid references core.user_accounts(id) on delete set null,
  updated_by uuid references core.user_accounts(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint professional_events_time_order check (
    ends_at is null or (starts_at is not null and ends_at >= starts_at)
  )
);

comment on table content.professional_events is
  'Professional Network event cards shown on the Professionals landing page. This is intentionally separate from volunteer opportunities and volunteer registrations.';

create index if not exists professional_events_public_listing_idx
  on content.professional_events (is_published, sort_order, starts_at, id);

alter table content.professional_events enable row level security;
alter table content.professional_events force row level security;

drop policy if exists professional_events_public_read on content.professional_events;
create policy professional_events_public_read
  on content.professional_events
  for select
  to anon, authenticated
  using (is_published = true);

revoke all on table content.professional_events from anon, authenticated;
grant select on table content.professional_events to anon, authenticated;
grant all on table content.professional_events to service_role;

commit;
