begin;

revoke select on table public.phaseone_events from authenticated;
revoke select on table public.phaseone_roster from authenticated;
revoke select on table public.phaseone_attendance_sessions from authenticated;

grant select (id,title,reporting_at,venue) on public.phaseone_events to authenticated;
grant select (id,volunteer_id) on public.phaseone_roster to authenticated;
grant select (event_id,attendance_date,origin_roster_id) on public.phaseone_attendance_sessions to authenticated;

drop policy if exists "MakLom members can read KELUARGA roster" on public.phaseone_roster;
create policy "MakLom members can read KELUARGA roster"
on public.phaseone_roster
for select
to authenticated
using (
  exists (
    select 1 from public.app_members m
    where m.user_id = (select auth.uid()) and m.active
  )
);

drop policy if exists "MakLom members can read KELUARGA attendance sessions" on public.phaseone_attendance_sessions;
create policy "MakLom members can read KELUARGA attendance sessions"
on public.phaseone_attendance_sessions
for select
to authenticated
using (
  exists (
    select 1 from public.app_members m
    where m.user_id = (select auth.uid()) and m.active
  )
);

create or replace view public.maklom_event_participation
with (security_invoker = true)
as
with source_rows as (
  select
    v.core_volunteer_id,
    case
      when e.keluarga_event_id is not null then 'keluarga:' || e.keluarga_event_id::text
      when nullif(a.event_id,'') is not null then 'maklom:' || a.event_id
      else 'historical:' || md5(lower(btrim(a.event_name)) || '|' || a.event_date::text)
    end as event_key,
    coalesce(pe.title,e.name,a.event_name) as event_title,
    a.event_date,
    'historical_attendance'::text as source_kind
  from public.attendance_log a
  join public.volunteers v on v.id=a.volunteer_id
  left join public.events e on e.id=a.event_id
  left join public.phaseone_events pe on pe.id=e.keluarga_event_id
  where a.attended and a.volunteer_id is not null

  union all

  select
    r.volunteer_id as core_volunteer_id,
    'keluarga:' || s.event_id::text as event_key,
    pe.title as event_title,
    s.attendance_date as event_date,
    'keluarga_attendance'::text as source_kind
  from public.phaseone_attendance_sessions s
  join public.phaseone_roster r on r.id=s.origin_roster_id
  join public.phaseone_events pe on pe.id=s.event_id
  where r.volunteer_id is not null
)
select
  core_volunteer_id,
  event_key,
  coalesce(
    max(event_title) filter (where source_kind='keluarga_attendance'),
    max(event_title)
  ) as event_title,
  min(event_date) as event_date,
  bool_or(source_kind='historical_attendance') as has_historical_source,
  bool_or(source_kind='keluarga_attendance') as has_keluarga_source
from source_rows
group by core_volunteer_id,event_key;

revoke all on public.maklom_event_participation from anon;
grant select on public.maklom_event_participation to authenticated;

create or replace view public.maklom_volunteer_intelligence
with (security_invoker = true)
as
with participation as (
  select
    core_volunteer_id,
    count(*)::integer as event_count,
    min(event_date) as first_event_date,
    max(event_date) as last_event_date,
    count(*) filter (
      where event_date >= ((now() at time zone 'Asia/Singapore')::date - 89)
    )::integer as events_last_90d
  from public.maklom_event_participation
  group by core_volunteer_id
),
historical_hours as (
  select
    v.core_volunteer_id,
    coalesce(sum(
      case when a.attended then coalesce(a.staff_credited_duration_minutes,a.calculated_duration_minutes,a.duration_minutes,0)
      else 0 end
    ),0)::bigint as historical_credited_minutes
  from public.attendance_log a
  join public.volunteers v on v.id=a.volunteer_id
  where a.volunteer_id is not null
  group by v.core_volunteer_id
),
approved_hours as (
  select volunteer_id as core_volunteer_id,
         coalesce(sum(approved_minutes),0)::bigint as approved_keluarga_minutes
  from public.volunteer_contributions
  where status='approved'
  group by volunteer_id
),
observations as (
  select
    volunteer_id as core_volunteer_id,
    count(*) filter (where status='accepted' and source_kind='insight')::integer as accepted_insights,
    count(*) filter (where status='accepted' and source_kind='review')::integer as accepted_reviews,
    count(*) filter (
      where status='accepted' and source_kind='review'
        and coalesce((payload->>'follow_up_required')::boolean,false)
    )::integer as accepted_follow_up_reviews
  from public.maklom_profile_inbox
  where volunteer_id is not null
  group by volunteer_id
)
select
  v.id as maklom_volunteer_id,
  v.core_volunteer_id,
  v.name,
  v.email,
  v.phone,
  v.recruited_year,
  v.tags,
  v.programmes_registered,
  coalesce(p.event_count,0) as event_count,
  p.first_event_date,
  p.last_event_date,
  coalesce(p.event_count,0) >= 2 as repeat_engaged,
  coalesce(p.events_last_90d,0) as events_last_90d,
  coalesce(p.events_last_90d,0) > 0 as active_last_90d,
  coalesce(h.historical_credited_minutes,0) as historical_credited_minutes,
  coalesce(a.approved_keluarga_minutes,0) as approved_keluarga_minutes,
  coalesce(o.accepted_insights,0) as accepted_insights,
  coalesce(o.accepted_reviews,0) as accepted_reviews,
  coalesce(o.accepted_follow_up_reviews,0) as accepted_follow_up_reviews
from public.volunteers v
left join participation p on p.core_volunteer_id=v.core_volunteer_id
left join historical_hours h on h.core_volunteer_id=v.core_volunteer_id
left join approved_hours a on a.core_volunteer_id=v.core_volunteer_id
left join observations o on o.core_volunteer_id=v.core_volunteer_id;

revoke all on public.maklom_volunteer_intelligence from anon;
grant select on public.maklom_volunteer_intelligence to authenticated;

create or replace view public.maklom_intelligence_summary
with (security_invoker = true)
as
select
  count(*)::integer as total_volunteers,
  count(*) filter (where event_count>0)::integer as deployed_volunteers,
  count(*) filter (where repeat_engaged)::integer as repeat_volunteers,
  case
    when count(*) filter (where event_count>0)=0 then null
    else round(
      100.0 * count(*) filter (where repeat_engaged)
      / count(*) filter (where event_count>0),
      1
    )
  end as repeat_engagement_rate,
  count(*) filter (where active_last_90d)::integer as active_last_90d,
  coalesce(sum(historical_credited_minutes),0)::bigint as historical_credited_minutes,
  coalesce(sum(approved_keluarga_minutes),0)::bigint as approved_keluarga_minutes,
  coalesce(sum(accepted_insights),0)::bigint as accepted_insights,
  coalesce(sum(accepted_reviews),0)::bigint as accepted_reviews,
  (select count(*)::integer from public.maklom_profile_inbox where status in ('pending','needs_match')) as unresolved_observations
from public.maklom_volunteer_intelligence;

revoke all on public.maklom_intelligence_summary from anon;
grant select on public.maklom_intelligence_summary to authenticated;

create or replace view public.maklom_participation_monthly
with (security_invoker = true)
as
with month_participation as (
  select
    date_trunc('month',event_date)::date as month,
    count(distinct core_volunteer_id)::integer as unique_volunteers,
    count(*)::integer as event_participations
  from public.maklom_event_participation
  group by 1
),
monthly_person_events as (
  select
    date_trunc('month',event_date)::date as month,
    core_volunteer_id,
    count(*) as events
  from public.maklom_event_participation
  group by 1,2
),
repeat_month as (
  select month,count(*) filter (where events>=2)::integer as repeat_volunteers
  from monthly_person_events
  group by month
),
legacy_hours as (
  select
    date_trunc('month',a.event_date)::date as month,
    coalesce(sum(
      case when a.attended then coalesce(a.staff_credited_duration_minutes,a.calculated_duration_minutes,a.duration_minutes,0)
      else 0 end
    ),0)::bigint as historical_credited_minutes
  from public.attendance_log a
  where a.volunteer_id is not null
  group by 1
),
approved_hours as (
  select
    date_trunc('month',occurred_at at time zone 'Asia/Singapore')::date as month,
    coalesce(sum(approved_minutes),0)::bigint as approved_keluarga_minutes
  from public.volunteer_contributions
  where status='approved'
  group by 1
)
select
  p.month,
  p.unique_volunteers,
  p.event_participations,
  coalesce(r.repeat_volunteers,0) as repeat_volunteers,
  coalesce(h.historical_credited_minutes,0) as historical_credited_minutes,
  coalesce(a.approved_keluarga_minutes,0) as approved_keluarga_minutes
from month_participation p
left join repeat_month r using(month)
left join legacy_hours h using(month)
left join approved_hours a using(month)
order by p.month;

revoke all on public.maklom_participation_monthly from anon;
grant select on public.maklom_participation_monthly to authenticated;

create or replace view public.maklom_retention_summary
with (security_invoker = true)
as
with settings as (
  select
    (now() at time zone 'Asia/Singapore')::date as as_of_date,
    date_trunc('year',(now() at time zone 'Asia/Singapore')::date)::date as cohort_start
),
firsts as (
  select core_volunteer_id,min(event_date) as first_event_date
  from public.maklom_event_participation
  group by core_volunteer_id
),
seconds as (
  select
    f.core_volunteer_id,
    f.first_event_date,
    min(p.event_date) filter (where p.event_date>f.first_event_date) as second_event_date
  from firsts f
  left join public.maklom_event_participation p on p.core_volunteer_id=f.core_volunteer_id
  group by f.core_volunteer_id,f.first_event_date
),
windows(window_days) as (values (30),(60),(90))
select
  extract(year from s.cohort_start)::integer as cohort_year,
  w.window_days,
  count(*) filter (
    where x.first_event_date>=s.cohort_start
      and x.first_event_date<(s.cohort_start+interval '1 year')::date
      and x.first_event_date<=s.as_of_date-w.window_days
  )::integer as eligible_volunteers,
  count(*) filter (
    where x.first_event_date>=s.cohort_start
      and x.first_event_date<(s.cohort_start+interval '1 year')::date
      and x.first_event_date<=s.as_of_date-w.window_days
      and x.second_event_date is not null
      and x.second_event_date<=x.first_event_date+w.window_days
  )::integer as retained_volunteers,
  case
    when count(*) filter (
      where x.first_event_date>=s.cohort_start
        and x.first_event_date<(s.cohort_start+interval '1 year')::date
        and x.first_event_date<=s.as_of_date-w.window_days
    )=0 then null
    else round(
      100.0 * count(*) filter (
        where x.first_event_date>=s.cohort_start
          and x.first_event_date<(s.cohort_start+interval '1 year')::date
          and x.first_event_date<=s.as_of_date-w.window_days
          and x.second_event_date is not null
          and x.second_event_date<=x.first_event_date+w.window_days
      )
      / count(*) filter (
        where x.first_event_date>=s.cohort_start
          and x.first_event_date<(s.cohort_start+interval '1 year')::date
          and x.first_event_date<=s.as_of_date-w.window_days
      ),
      1
    )
  end as retention_rate,
  s.as_of_date
from seconds x
cross join windows w
cross join settings s
group by s.cohort_start,s.as_of_date,w.window_days
order by w.window_days;

revoke all on public.maklom_retention_summary from anon;
grant select on public.maklom_retention_summary to authenticated;

comment on view public.maklom_event_participation is
  'Canonical cross-event participation grain: one linked volunteer per deduplicated event. Legacy MakLom attendance and KELUARGA attendance are merged by KELUARGA event ID when an explicit event link exists.';
comment on view public.maklom_volunteer_intelligence is
  'MakLom cross-event volunteer intelligence. Participation is operational evidence; historical credited minutes and MakLom-approved KELUARGA contribution minutes remain separate provenance columns.';
comment on view public.maklom_intelligence_summary is
  'Summary of cross-event volunteer intelligence. Repeat engagement denominator is volunteers with at least one deduplicated attended event.';
comment on view public.maklom_retention_summary is
  'Current-year first-participation cohort retention. Eligible volunteers have matured through the requested window; retained means a later distinct event occurred within that many days.';

commit;
