drop policy if exists "Public can read opportunity overrides"
on public.phaseone_opportunity_overrides;

revoke all on public.phaseone_opportunity_overrides from anon, authenticated;
grant select, insert, update, delete on public.phaseone_opportunity_overrides to service_role;

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
    coalesce(override.title, source.title),
    coalesce(override.summary, source.summary),
    coalesce(override.image_url, source.image_url),
    coalesce(override.starts_at, source.starts_at),
    coalesce(override.ends_at, source.ends_at),
    coalesce(override.schedule_text, source.schedule_text),
    coalesce(override.venue, source.venue),
    source.source_url,
    source.imported_at,
    override.sort_order,
    (override.external_opportunity_id is not null)
  from public.phaseone_external_opportunities as source
  left join public.phaseone_opportunity_overrides as override
    on override.external_opportunity_id = source.id
  where source.is_active = true
    and coalesce(override.is_visible, true) = true
  order by
    (override.sort_order is null),
    override.sort_order asc nulls last,
    coalesce(override.starts_at, source.starts_at) desc nulls last,
    source.imported_at desc
  limit 100;
$$;

revoke all on function public.list_phaseone_opportunities() from public;
grant execute on function public.list_phaseone_opportunities()
  to anon, authenticated, service_role;

comment on function public.list_phaseone_opportunities() is
  'Public-safe effective opportunity card projection with staff overrides applied and hidden cards removed.';
