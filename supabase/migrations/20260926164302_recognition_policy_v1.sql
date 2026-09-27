begin;
-- Version 1 begins when this migration is applied in each environment.
insert into gamification.point_rules(stable_key,version,name,description,source_kind,calculation_method,points_value,effective_from,status,activated_at)
values
('approved-contribution-hours',1,'Approved volunteering','10 points per MakLom-approved hour, including partial hours.','maklom_approved_contribution','per_verified_hour',10,now(),'active',now()),
('volunteer-engagement',1,'Staying connected','Small, capped awards for exploring opportunities, reviewing and completing your profile.','volunteer_engagement','flat',0,now(),'active',now()),
('approved-hour-milestones',1,'Volunteering milestones','First contribution and 15, 30 and 60 approved hour milestones.','approved_hour_milestone','flat',0,now(),'active',now())
on conflict(stable_key,version) do nothing;

insert into gamification.badge_definitions(stable_key,name,description)
values
('first-step','First Step','Your first volunteering contribution has been approved.'),
('helping-hand-15','Helping Hand','You have contributed 15 approved volunteering hours.'),
('community-builder-30','Community Builder','You have contributed 30 approved volunteering hours.'),
('community-champion-60','Community Champion','You have contributed 60 approved volunteering hours.'),
('mendaki-appreciation','MENDAKI Appreciation','Recognition awarded by the Volunteer Management team.')
on conflict(stable_key) do nothing;

-- The ledger stays append-only. All automated entries are uniquely identified by the source and event.
create unique index if not exists point_ledger_recognition_event_uidx
on gamification.point_ledger_entries(source_kind,source_record_id)
where source_kind in ('volunteer_engagement','approved_hour_milestone');

create or replace function gamification.reconcile_approved_recognition(
  p_volunteer_id uuid,
  p_prior_minutes integer default 0,
  p_prior_count integer default 0
) returns void
language plpgsql security definer
set search_path = pg_catalog
as $body$
declare
  v_minutes integer;
  v_current_points numeric;
  v_expected_points numeric;
  v_delta numeric;
  v_total_minutes integer;
  v_count integer;
  v_rule gamification.point_rules%rowtype;
  v_bonus_rule gamification.point_rules%rowtype;
  v_title text;
  v_threshold integer;
  v_bonus integer;
  v_key text;
  v_existing numeric;
  v_badge_id uuid;
  v_badge_award gamification.volunteer_badges%rowtype;
  v_should_have boolean;
begin
  perform pg_advisory_xact_lock(hashtextextended('recognition:'||p_volunteer_id::text,0));
  select * into v_rule from gamification.point_rules
    where stable_key='approved-contribution-hours' and status='active';
  select * into v_bonus_rule from gamification.point_rules
    where stable_key='approved-hour-milestones' and status='active';
  if v_rule.id is null or v_bonus_rule.id is null then return; end if;
  select coalesce(sum(approved_minutes),0)::integer,count(*)::integer
    into v_total_minutes,v_count
  from public.volunteer_contributions
  where volunteer_id=p_volunteer_id and status='approved';
  select coalesce(sum(approved_minutes),0)::integer into v_minutes
  from public.volunteer_contributions
  where volunteer_id=p_volunteer_id and status='approved'
    and approved_at >= v_rule.effective_from;
  v_expected_points := round(v_minutes::numeric / 6, 2);
  select coalesce(sum(points_delta),0) into v_current_points
  from gamification.point_ledger_entries
  where volunteer_id=p_volunteer_id and source_kind='maklom_approved_contribution';
  v_delta := v_expected_points-v_current_points;
  if v_delta<>0 then
    insert into gamification.point_ledger_entries
      (volunteer_id,rule_id,source_kind,source_record_id,source_occurred_at,source_updated_at,source_title,entry_kind,points_delta,reason,source_snapshot)
    values(p_volunteer_id,v_rule.id,'maklom_approved_contribution',
      gen_random_uuid()::text,now(),now(),'Approved volunteering hours',
      case when v_delta>0 then 'award'::gamification.point_entry_kind else 'reversal'::gamification.point_entry_kind end,
      v_delta,'Reconciled against MakLom-approved minutes',
      jsonb_build_object('approved_minutes_since_activation',v_minutes,'approved_points_total',v_expected_points));
  end if;

  for v_threshold,v_bonus,v_key,v_title in
    select * from (values
      (1,20,'first','First approved contribution'),
      (900,50,'15','15 approved hours'),
      (1800,100,'30','30 approved hours'),
      (3600,200,'60','60 approved hours')) as milestones(minutes,points,key,title)
  loop
    select coalesce(sum(points_delta),0) into v_existing
    from gamification.point_ledger_entries
    where volunteer_id=p_volunteer_id and source_kind='approved_hour_milestone'
      and source_snapshot->>'milestone'=v_key;
    v_should_have := case when v_threshold=1 then v_count>0 else v_total_minutes>=v_threshold end;
    -- Existing historical milestones earn badges but no retroactive point bonus.
    if v_should_have and v_existing=0
       and (case when v_threshold=1 then p_prior_count=0 else p_prior_minutes<v_threshold end)
       and exists (
          select 1 from public.volunteer_contributions
          where volunteer_id=p_volunteer_id and status='approved'
            and approved_at>=v_bonus_rule.effective_from
       )
    then
      insert into gamification.point_ledger_entries
        (volunteer_id,rule_id,source_kind,source_record_id,source_occurred_at,source_updated_at,source_title,entry_kind,points_delta,reason,source_snapshot)
      values(p_volunteer_id,v_bonus_rule.id,'approved_hour_milestone',gen_random_uuid()::text,
        now(),now(),v_title,'award',v_bonus,v_title,
        jsonb_build_object('milestone',v_key,'approved_minutes',v_total_minutes));
    elsif not v_should_have and v_existing>0 then
      insert into gamification.point_ledger_entries
        (volunteer_id,rule_id,source_kind,source_record_id,source_occurred_at,source_updated_at,source_title,entry_kind,points_delta,reason,source_snapshot)
      values(p_volunteer_id,v_bonus_rule.id,'approved_hour_milestone',gen_random_uuid()::text,
        now(),now(),v_title,'reversal',-v_existing,'Approved hours corrected below milestone',
        jsonb_build_object('milestone',v_key,'approved_minutes',v_total_minutes));
    end if;
    select id into v_badge_id from gamification.badge_definitions
      where stable_key=case v_key when 'first' then 'first-step' when '15' then 'helping-hand-15'
        when '30' then 'community-builder-30' else 'community-champion-60' end;
    select * into v_badge_award from gamification.volunteer_badges
      where volunteer_id=p_volunteer_id and badge_id=v_badge_id
        and revoked_at is null and reason like 'Automatic:%'
      limit 1;
    if v_should_have and v_badge_award.id is null then
      -- A manually awarded instance of the same badge is left untouched.
      if not exists(select 1 from gamification.volunteer_badges where volunteer_id=p_volunteer_id
                    and badge_id=v_badge_id and revoked_at is null) then
        insert into gamification.volunteer_badges(volunteer_id,badge_id,reason,request_id)
        values(p_volunteer_id,v_badge_id,'Automatic: approved contribution milestone',gen_random_uuid());
      end if;
    elsif not v_should_have and v_badge_award.id is not null then
      update gamification.volunteer_badges
        set revoked_at=now(),revocation_reason='Approved hours corrected below milestone'
      where id=v_badge_award.id;
    end if;
    v_badge_award:=null;
  end loop;
end
$body$;
revoke all on function gamification.reconcile_approved_recognition(uuid,integer,integer) from public,anon,authenticated;

create or replace function gamification.on_contribution_review()
returns trigger language plpgsql security definer set search_path=pg_catalog as $body$
declare v_prior_minutes integer; v_prior_count integer; v_total_minutes integer; v_total_count integer;
begin
  if tg_op='UPDATE' and old.status is not distinct from new.status
      and old.approved_minutes is not distinct from new.approved_minutes
      and old.volunteer_id is not distinct from new.volunteer_id then return new; end if;
  if tg_op='UPDATE' and old.volunteer_id is distinct from new.volunteer_id then
    raise exception 'Contribution volunteer cannot be reassigned' using errcode='23514';
  end if;
  select coalesce(sum(approved_minutes),0)::integer,count(*)::integer into v_total_minutes,v_total_count
    from public.volunteer_contributions where volunteer_id=new.volunteer_id and status='approved';
  v_prior_minutes:=v_total_minutes - (case when new.status='approved' then new.approved_minutes else 0 end)
    + (case when tg_op='UPDATE' and old.status='approved' then old.approved_minutes else 0 end);
  v_prior_count:=v_total_count - (case when new.status='approved' then 1 else 0 end)
    + (case when tg_op='UPDATE' and old.status='approved' then 1 else 0 end);
  perform gamification.reconcile_approved_recognition(new.volunteer_id,v_prior_minutes,v_prior_count);
  return new;
end
$body$;
revoke all on function gamification.on_contribution_review() from public,anon,authenticated;
create trigger volunteer_contributions_recognition
after insert or update of status,approved_minutes,volunteer_id on public.volunteer_contributions
for each row execute function gamification.on_contribution_review();

-- Historic approved contributions earn badges, without retroactive points.
do $body$
declare v record;
begin
 for v in select volunteer_id from public.volunteer_contributions where status='approved' group by volunteer_id loop
   perform gamification.reconcile_approved_recognition(v.volunteer_id,2147483647,2147483647);
 end loop;
end $body$;

create or replace function core.record_volunteer_engagement(p_action text,p_context text default null)
returns numeric language plpgsql security definer set search_path=pg_catalog as $body$
declare v_user uuid:=auth.uid(); v_volunteer uuid; v_rule gamification.point_rules%rowtype;
  v_bucket text; v_key text; v_amount integer; v_profile record; v_private record; v_complete boolean;
  v_existing numeric;
begin
 if v_user is null or not core.is_current_account_active() then
   raise exception 'Active volunteer account required' using errcode='42501';
 end if;
 select id into v_volunteer from core.volunteers where auth_user_id=v_user;
 if v_volunteer is null then raise exception 'Volunteer profile required' using errcode='42501'; end if;
 select * into v_rule from gamification.point_rules where stable_key='volunteer-engagement' and status='active';
 if v_rule.id is null then raise exception 'Engagement rule unavailable' using errcode='55000'; end if;
 if p_action='opportunity_view' then
   if p_context is null or not exists (
     select 1 from public.phaseone_events where slug=p_context and is_opportunity_published=true
   ) then raise exception 'Published opportunity required' using errcode='22023'; end if;
   v_bucket:=to_char((now() at time zone 'Asia/Singapore')::date,'IYYY-IW');
   v_amount:=2;
 elsif p_action='profile_review' then
   v_bucket:=to_char((now() at time zone 'Asia/Singapore')::date,'YYYY-MM');
   v_amount:=2;
 elsif p_action='profile_complete' then
   select * into v_profile from public.keluarga_volunteer_profiles where volunteer_id=v_volunteer;
   select * into v_private from public.volunteer_private_details where volunteer_id=v_volunteer;
   v_complete:=exists(select 1 from core.volunteers where id=v_volunteer and nullif(btrim(display_name),'') is not null and nullif(btrim(mobile),'') is not null)
     and v_profile.volunteer_id is not null and v_private.volunteer_id is not null
     and nullif(btrim(v_profile.avatar_path),'') is not null
     and coalesce(array_length(v_profile.interests,1),0)>0
     and coalesce(array_length(v_profile.skills,1),0)>0
     and coalesce(array_length(v_profile.availability_slots,1),0)>0
     and nullif(btrim(v_profile.preferred_commitment),'') is not null
     and v_private.date_of_birth is not null
     and nullif(btrim(v_private.postal_code),'') is not null
     and nullif(btrim(v_private.address_line),'') is not null
     and nullif(btrim(v_private.tshirt_size),'') is not null
     and (v_private.no_known_food_allergies or nullif(btrim(v_private.food_allergies),'') is not null)
     and nullif(btrim(v_private.highest_qualification),'') is not null;
   if not coalesce(v_complete,false) then raise exception 'Profile milestones incomplete' using errcode='22023'; end if;
   v_bucket:='once'; v_amount:=20;
 else raise exception 'Unknown engagement action' using errcode='22023';
 end if;
 v_key:=v_volunteer::text||':'||p_action||':'||v_bucket;
 perform pg_advisory_xact_lock(hashtextextended('engagement:'||v_key,0));
 select points_delta into v_existing from gamification.point_ledger_entries
 where source_kind='volunteer_engagement' and source_record_id=v_key;
 if found then return 0; end if;
 insert into gamification.point_ledger_entries
 (volunteer_id,rule_id,source_kind,source_record_id,source_occurred_at,source_updated_at,source_title,entry_kind,points_delta,reason,source_snapshot)
 values(v_volunteer,v_rule.id,'volunteer_engagement',v_key,now(),now(),
   case p_action when 'opportunity_view' then 'Explored volunteer opportunities'
     when 'profile_review' then 'Reviewed volunteer profile' else 'Completed volunteer profile' end,
   'award',v_amount,'Volunteer engagement',jsonb_build_object('action',p_action,'bucket',v_bucket));
 return v_amount;
end
$body$;
revoke all on function core.record_volunteer_engagement(text,text) from public,anon,authenticated;
grant execute on function core.record_volunteer_engagement(text,text) to authenticated;

-- The active rule displayed to volunteers now follows MakLom approval.
create or replace function core.get_current_points_snapshot()
returns jsonb language plpgsql stable security definer
set search_path=pg_catalog,core,gamification as $body$
declare v_user uuid:=auth.uid(); v_volunteer uuid;
begin
 if v_user is null then raise exception 'Authentication required' using errcode='42501'; end if;
 if not core.is_current_account_active() then return jsonb_build_object('linked',false,'balance',0,'last_changed_at',null,'active_rule',null,'entries','[]'::jsonb); end if;
 select id into v_volunteer from core.volunteers where auth_user_id=v_user;
 if v_volunteer is null then return jsonb_build_object('linked',false,'balance',0,'last_changed_at',null,'active_rule',null,'entries','[]'::jsonb); end if;
 return jsonb_build_object(
 'linked',true,
 'balance',coalesce((select sum(points_delta) from gamification.point_ledger_entries where volunteer_id=v_volunteer),0),
 'last_changed_at',(select max(created_at) from gamification.point_ledger_entries where volunteer_id=v_volunteer),
 'active_rule',(select jsonb_build_object('id',id,'name',name,'description',description,'calculation_method',calculation_method,'points_value',points_value,'effective_from',effective_from)
                from gamification.point_rules where stable_key='approved-contribution-hours' and status='active' limit 1),
 'entries',coalesce((select jsonb_agg(to_jsonb(t) order by t.created_at desc,t.id desc) from (
   select id::text,source_kind,source_record_id,source_occurred_at,source_title,entry_kind,points_delta,reason,created_at
   from gamification.point_ledger_entries where volunteer_id=v_volunteer order by created_at desc,id desc limit 20
 ) t),'[]'::jsonb));
end
$body$;
revoke all on function core.get_current_points_snapshot() from public,anon;
grant execute on function core.get_current_points_snapshot() to authenticated;
commit;
