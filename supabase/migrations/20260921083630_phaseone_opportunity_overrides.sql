create table public.phaseone_opportunity_overrides (
  external_opportunity_id uuid primary key
    references public.phaseone_external_opportunities(id) on delete cascade,
  title text,
  summary text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  schedule_text text,
  venue text,
  is_visible boolean not null default true,
  sort_order integer,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_opportunity_overrides_title_length
    check (title is null or (char_length(btrim(title)) between 1 and 140)),
  constraint phaseone_opportunity_overrides_summary_length
    check (summary is null or char_length(summary) <= 400),
  constraint phaseone_opportunity_overrides_image_https
    check (image_url is null or image_url = '' or image_url ~ '^https://'),
  constraint phaseone_opportunity_overrides_schedule_length
    check (schedule_text is null or char_length(schedule_text) <= 100),
  constraint phaseone_opportunity_overrides_venue_length
    check (venue is null or char_length(venue) <= 180),
  constraint phaseone_opportunity_overrides_sort_order
    check (sort_order is null or sort_order between 0 and 9999),
  constraint phaseone_opportunity_overrides_date_order
    check (starts_at is null or ends_at is null or ends_at >= starts_at)
);

create index phaseone_opportunity_overrides_display_idx
  on public.phaseone_opportunity_overrides (is_visible, sort_order);

alter table public.phaseone_opportunity_overrides enable row level security;

create policy "Public can read opportunity overrides"
on public.phaseone_opportunity_overrides
for select
to anon, authenticated
using (true);

revoke all on public.phaseone_opportunity_overrides from anon, authenticated;
grant select on public.phaseone_opportunity_overrides to anon, authenticated;

comment on table public.phaseone_opportunity_overrides is
  'Staff-managed presentation overrides for imported opportunity cards. Source imports remain unchanged.';
