begin;

create table public.phaseone_opportunity_overrides (
  opportunity_id uuid primary key
    references public.phaseone_external_opportunities(id) on delete cascade,
  title text not null,
  summary text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  schedule_text text,
  venue text,
  is_hidden boolean not null default false,
  sort_order integer,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_opportunity_overrides_title_length
    check (char_length(btrim(title)) between 1 and 180),
  constraint phaseone_opportunity_overrides_summary_length
    check (summary is null or char_length(summary) <= 600),
  constraint phaseone_opportunity_overrides_image_https
    check (image_url is null or image_url ~ '^https://'),
  constraint phaseone_opportunity_overrides_schedule_length
    check (schedule_text is null or char_length(schedule_text) <= 160),
  constraint phaseone_opportunity_overrides_venue_length
    check (venue is null or char_length(venue) <= 240),
  constraint phaseone_opportunity_overrides_date_order
    check (starts_at is null or ends_at is null or ends_at >= starts_at),
  constraint phaseone_opportunity_overrides_sort_order_range
    check (sort_order is null or sort_order between -10000 and 10000)
);

create index phaseone_opportunity_overrides_sort_idx
  on public.phaseone_opportunity_overrides (is_hidden, sort_order, opportunity_id);

alter table public.phaseone_opportunity_overrides enable row level security;

revoke all on public.phaseone_opportunity_overrides
  from public, anon, authenticated;
grant select, insert, update, delete
  on public.phaseone_opportunity_overrides
  to service_role;

comment on table public.phaseone_opportunity_overrides is
  'Staff-managed presentation overrides for imported opportunity cards. Source records remain untouched.';

create or replace function public.list_phaseone_opportunities()
returns table (
  id uuid,
  title text,
  summary text,
  image_url text,
  starts_at timestamptz,
  ends_at timestamptz,
  schedule_text text,
  venue text,
  source_url text,
  imported_at timestamptz,
  sort_order integer,
  has_manual_override boolean
)
language sql
stable
security definer
set search_path = pg_catalog, public
as $$
  select
    source.id,
    case when override.opportunity_id is not null then override.title else source.title end,
    case when override.opportunity_id is not null then override.summary else source.summary end,
    case when override.opportunity_id is not null then override.image_url else source.image_url end,
    case when override.opportunity_id is not null then override.starts_at else source.starts_at end,
    case when override.opportunity_id is not null then override.ends_at else source.ends_at end,
    case when override.opportunity_id is not null then override.schedule_text else source.schedule_text end,
    case when override.opportunity_id is not null then override.venue else source.venue end,
    source.source_url,
    source.imported_at,
    override.sort_order,
    (override.opportunity_id is not null)
  from public.phaseone_external_opportunities as source
  left join public.phaseone_opportunity_overrides as override
    on override.opportunity_id = source.id
  where source.is_active = true
    and coalesce(override.is_hidden, false) = false
  order by
    (override.sort_order is null),
    override.sort_order asc nulls last,
    case when override.opportunity_id is not null then override.starts_at else source.starts_at end desc nulls last,
    source.imported_at desc
  limit 100;
$$;

revoke all on function public.list_phaseone_opportunities()
  from public;
grant execute on function public.list_phaseone_opportunities()
  to anon, authenticated, service_role;

comment on function public.list_phaseone_opportunities() is
  'Public-safe effective opportunity card projection with staff overrides applied and hidden cards removed.';

commit;
