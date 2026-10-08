begin;

create table if not exists core.website_pageviews (
  id bigint generated always as identity primary key,
  visitor_id uuid not null,
  path text not null check (char_length(path) between 1 and 300 and left(path, 1) = '/'),
  source text not null default 'direct' check (char_length(source) between 1 and 80),
  device text not null check (device in ('desktop', 'mobile', 'tablet', 'other')),
  occurred_at timestamptz not null default now()
);

comment on table core.website_pageviews is
  'Privacy-minimised first-party Keluarga website pageviews. visitor_id is a random browser cookie; no IP address, raw user agent or full referrer is stored.';

create index if not exists website_pageviews_occurred_at_idx
  on core.website_pageviews (occurred_at desc);
create index if not exists website_pageviews_visitor_occurred_idx
  on core.website_pageviews (visitor_id, occurred_at desc);
create index if not exists website_pageviews_path_occurred_idx
  on core.website_pageviews (path, occurred_at desc);

alter table core.website_pageviews enable row level security;
alter table core.website_pageviews force row level security;

revoke all on core.website_pageviews from anon, authenticated;
grant select, insert on core.website_pageviews to service_role;
grant usage, select on sequence core.website_pageviews_id_seq to service_role;

create or replace function core.website_analytics_summary(
  p_start date,
  p_end date
)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
bounds as (
  select
    (p_start::timestamp at time zone 'Asia/Singapore') as start_at,
    ((p_end + 1)::timestamp at time zone 'Asia/Singapore') as end_at
),
pageviews as (
  select
    pv.visitor_id,
    pv.path,
    pv.source,
    pv.device,
    pv.occurred_at,
    (pv.occurred_at at time zone 'Asia/Singapore')::date as day
  from core.website_pageviews pv, bounds b
  where pv.occurred_at >= b.start_at
    and pv.occurred_at < b.end_at
),
daily_pageviews as (
  select day, count(*)::bigint as pageviews, count(distinct visitor_id)::bigint as visitors
  from pageviews
  group by day
),
volunteer_signups as (
  select
    p.volunteer_id,
    p.onboarding_completed_at,
    (p.onboarding_completed_at at time zone 'Asia/Singapore')::date as day
  from public.keluarga_volunteer_profiles p, bounds b
  where p.onboarding_completed_at is not null
    and p.onboarding_completed_at >= b.start_at
    and p.onboarding_completed_at < b.end_at
),
daily_signups as (
  select day, count(*)::bigint as signups
  from volunteer_signups
  group by day
),
registrations as (
  select
    kr.id,
    kr.volunteer_id,
    kr.submitted_at,
    (kr.submitted_at at time zone 'Asia/Singapore')::date as day
  from public.keluarga_registrations kr, bounds b
  where kr.submitted_at >= b.start_at
    and kr.submitted_at < b.end_at
),
daily_registrations as (
  select day, count(*)::bigint as registrations, count(distinct volunteer_id)::bigint as registrants
  from registrations
  group by day
),
days as (
  select generate_series(p_start, p_end, interval '1 day')::date as day
),
daily as (
  select
    d.day,
    coalesce(p.pageviews, 0)::bigint as pageviews,
    coalesce(p.visitors, 0)::bigint as visitors,
    coalesce(s.signups, 0)::bigint as signups,
    coalesce(r.registrations, 0)::bigint as registrations,
    coalesce(r.registrants, 0)::bigint as registrants
  from days d
  left join daily_pageviews p using (day)
  left join daily_signups s using (day)
  left join daily_registrations r using (day)
  order by d.day
),
top_pages as (
  select path, count(*)::bigint as pageviews, count(distinct visitor_id)::bigint as visitors
  from pageviews
  group by path
  order by pageviews desc, visitors desc, path
  limit 10
),
sources as (
  select source, count(*)::bigint as pageviews, count(distinct visitor_id)::bigint as visitors
  from pageviews
  where source <> 'internal'
  group by source
  order by visitors desc, pageviews desc, source
  limit 8
),
devices as (
  select device, count(*)::bigint as pageviews, count(distinct visitor_id)::bigint as visitors
  from pageviews
  group by device
  order by visitors desc, pageviews desc, device
),
pathways as (
  select
    case
      when path = '/coach' or path like '/coach/%' then 'Coach'
      when path = '/facilitator' or path like '/facilitator/%' then 'Facilitator'
      when path = '/mentor' or path like '/mentor/%' then 'Mentor'
      when path = '/contributor' or path like '/contributor/%' then 'Contributor'
      when path = '/specialist' or path like '/specialist/%' then 'Professional Networks'
      else null
    end as pathway,
    visitor_id
  from pageviews
),
pathway_rollup as (
  select pathway, count(*)::bigint as pageviews, count(distinct visitor_id)::bigint as visitors
  from pathways
  where pathway is not null
  group by pathway
  order by visitors desc, pageviews desc, pathway
)
select jsonb_build_object(
  'tracking_started_at', (select min(pv.occurred_at) from core.website_pageviews pv),
  'daily', coalesce(
    (select jsonb_agg(
      jsonb_build_object(
        'day', daily.day,
        'pageviews', daily.pageviews,
        'visitors', daily.visitors,
        'signups', daily.signups,
        'registrations', daily.registrations,
        'registrants', daily.registrants
      ) order by daily.day
    ) from daily),
    '[]'::jsonb
  ),
  'totals', jsonb_build_object(
    'pageviews', (select count(*)::bigint from pageviews),
    'visitors', (select count(distinct visitor_id)::bigint from pageviews),
    'signups', (select count(*)::bigint from volunteer_signups),
    'registrations', (select count(*)::bigint from registrations),
    'registrants', (select count(distinct volunteer_id)::bigint from registrations)
  ),
  'top_pages', coalesce(
    (select jsonb_agg(jsonb_build_object('path', path, 'pageviews', pageviews, 'visitors', visitors)) from top_pages),
    '[]'::jsonb
  ),
  'sources', coalesce(
    (select jsonb_agg(jsonb_build_object('source', source, 'pageviews', pageviews, 'visitors', visitors)) from sources),
    '[]'::jsonb
  ),
  'devices', coalesce(
    (select jsonb_agg(jsonb_build_object('device', device, 'pageviews', pageviews, 'visitors', visitors)) from devices),
    '[]'::jsonb
  ),
  'pathways', coalesce(
    (select jsonb_agg(jsonb_build_object('pathway', pathway, 'pageviews', pageviews, 'visitors', visitors)) from pathway_rollup),
    '[]'::jsonb
  )
);
$$;

revoke all on function core.website_analytics_summary(date, date) from public, anon, authenticated;
grant execute on function core.website_analytics_summary(date, date) to service_role;

commit;
