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
days as (
  select generate_series(p_start, p_end, interval '1 day')::date as day
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
  select
    day,
    count(*)::bigint as pageviews,
    count(distinct visitor_id)::bigint as visitors
  from pageviews
  group by day
),
pageview_baseline as (
  select
    count(*)::bigint as pageviews,
    count(distinct visitor_id)::bigint as visitors
  from core.website_pageviews pv, bounds b
  where pv.occurred_at < b.start_at
),
first_seen_visitors as (
  select
    first_seen_day as day,
    count(*)::bigint as new_visitors
  from (
    select
      pv.visitor_id,
      min((pv.occurred_at at time zone 'Asia/Singapore')::date) as first_seen_day
    from core.website_pageviews pv, bounds b
    where pv.occurred_at < b.end_at
    group by pv.visitor_id
  ) first_seen
  where first_seen_day between p_start and p_end
  group by first_seen_day
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
signup_baseline as (
  select count(*)::bigint as signups
  from public.keluarga_volunteer_profiles p, bounds b
  where p.onboarding_completed_at is not null
    and p.onboarding_completed_at < b.start_at
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
  select
    day,
    count(*)::bigint as registrations,
    count(distinct volunteer_id)::bigint as registrants
  from registrations
  group by day
),
registration_baseline as (
  select
    count(*)::bigint as registrations,
    count(distinct volunteer_id)::bigint as registrants
  from public.keluarga_registrations kr, bounds b
  where kr.submitted_at < b.start_at
),
first_registration_days as (
  select
    first_registration_day as day,
    count(*)::bigint as new_registrants
  from (
    select
      kr.volunteer_id,
      min((kr.submitted_at at time zone 'Asia/Singapore')::date) as first_registration_day
    from public.keluarga_registrations kr, bounds b
    where kr.submitted_at < b.end_at
    group by kr.volunteer_id
  ) first_registration
  where first_registration_day between p_start and p_end
  group by first_registration_day
),
daily_base as (
  select
    d.day,
    coalesce(p.pageviews, 0)::bigint as pageviews,
    coalesce(p.visitors, 0)::bigint as visitors,
    coalesce(fsv.new_visitors, 0)::bigint as new_visitors,
    coalesce(s.signups, 0)::bigint as signups,
    coalesce(r.registrations, 0)::bigint as registrations,
    coalesce(r.registrants, 0)::bigint as registrants,
    coalesce(frd.new_registrants, 0)::bigint as new_registrants
  from days d
  left join daily_pageviews p using (day)
  left join first_seen_visitors fsv using (day)
  left join daily_signups s using (day)
  left join daily_registrations r using (day)
  left join first_registration_days frd using (day)
),
daily as (
  select
    db.day,
    db.pageviews,
    db.visitors,
    db.signups,
    db.registrations,
    db.registrants,
    (
      (select pageviews from pageview_baseline)
      + sum(db.pageviews) over (order by db.day rows between unbounded preceding and current row)
    )::bigint as cumulative_pageviews,
    (
      (select visitors from pageview_baseline)
      + sum(db.new_visitors) over (order by db.day rows between unbounded preceding and current row)
    )::bigint as cumulative_visitors,
    (
      (select signups from signup_baseline)
      + sum(db.signups) over (order by db.day rows between unbounded preceding and current row)
    )::bigint as cumulative_signups,
    (
      (select registrations from registration_baseline)
      + sum(db.registrations) over (order by db.day rows between unbounded preceding and current row)
    )::bigint as cumulative_registrations,
    (
      (select registrants from registration_baseline)
      + sum(db.new_registrants) over (order by db.day rows between unbounded preceding and current row)
    )::bigint as cumulative_registrants
  from daily_base db
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
      when path = '/volunteer/coach' or path like '/volunteer/coach/%' then 'Coach'
      when path = '/volunteer/facilitator' or path like '/volunteer/facilitator/%' then 'Facilitator'
      when path = '/volunteer/mentor' or path like '/volunteer/mentor/%' then 'Mentor'
      when path = '/opportunities' or path like '/opportunities/%' then 'Contributor'
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
),
latest_cumulative as (
  select
    cumulative_pageviews,
    cumulative_visitors,
    cumulative_signups,
    cumulative_registrations,
    cumulative_registrants
  from daily
  order by day desc
  limit 1
)
select jsonb_build_object(
  'tracking_started_at', (select min(pv.occurred_at) from core.website_pageviews pv),
  'daily', coalesce(
    (
      select jsonb_agg(
        jsonb_build_object(
          'day', daily.day,
          'pageviews', daily.pageviews,
          'visitors', daily.visitors,
          'signups', daily.signups,
          'registrations', daily.registrations,
          'registrants', daily.registrants,
          'cumulative_pageviews', daily.cumulative_pageviews,
          'cumulative_visitors', daily.cumulative_visitors,
          'cumulative_signups', daily.cumulative_signups,
          'cumulative_registrations', daily.cumulative_registrations,
          'cumulative_registrants', daily.cumulative_registrants
        )
        order by daily.day
      )
      from daily
    ),
    '[]'::jsonb
  ),
  'totals', jsonb_build_object(
    'pageviews', (select count(*)::bigint from pageviews),
    'visitors', (select count(distinct visitor_id)::bigint from pageviews),
    'signups', (select count(*)::bigint from volunteer_signups),
    'registrations', (select count(*)::bigint from registrations),
    'registrants', (select count(distinct volunteer_id)::bigint from registrations)
  ),
  'cumulative', coalesce(
    (
      select jsonb_build_object(
        'pageviews', cumulative_pageviews,
        'visitors', cumulative_visitors,
        'signups', cumulative_signups,
        'registrations', cumulative_registrations,
        'registrants', cumulative_registrants
      )
      from latest_cumulative
    ),
    jsonb_build_object(
      'pageviews', 0,
      'visitors', 0,
      'signups', 0,
      'registrations', 0,
      'registrants', 0
    )
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
