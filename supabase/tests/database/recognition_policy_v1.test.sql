begin;
select plan(8);

insert into auth.users(id,email,email_confirmed_at)
values ('93300000-0000-4000-8000-000000000001','recognition-volunteer@example.test',now());

insert into core.volunteers(id,auth_user_id,display_name,primary_email_normalized,mobile)
values ('93300000-0000-4000-8000-000000000002',
'93300000-0000-4000-8000-000000000001','Recognition Volunteer',
'recognition-volunteer@example.test','81234567');
update core.user_accounts set status='active'
where id='93300000-0000-4000-8000-000000000001';

insert into public.phaseone_events(id,title,slug,created_by,updated_by,is_opportunity_published)
values ('93300000-0000-4000-8000-000000000003','Recognition Test','recognition-test',
'93300000-0000-4000-8000-000000000001','93300000-0000-4000-8000-000000000001',true);
insert into public.phaseone_event_timeslots(id,event_id,label,starts_at,ends_at,sort_order)
values ('93300000-0000-4000-8000-000000000004',
'93300000-0000-4000-8000-000000000003','Test shift',now(),now()+interval '15 hours',1);
insert into public.phaseone_roster(id,event_id,timeslot_id,volunteer_key,volunteer_name,email,uploaded_by,volunteer_id)
values ('93300000-0000-4000-8000-000000000005',
'93300000-0000-4000-8000-000000000003',
'93300000-0000-4000-8000-000000000004','RECOG-1','Recognition Volunteer',
'recognition-volunteer@example.test','93300000-0000-4000-8000-000000000001',
'93300000-0000-4000-8000-000000000002');
insert into public.phaseone_attendance_sessions
(id,event_id,attendance_date,person_key,origin_roster_id,checked_in_at,checked_out_at)
values ('93300000-0000-4000-8000-000000000006',
'93300000-0000-4000-8000-000000000003',current_date,
'id:93300000-0000-4000-8000-000000000002',
'93300000-0000-4000-8000-000000000005',now()-interval '15 hours',now());

select is((select count(*)::integer from gamification.point_ledger_entries
where volunteer_id='93300000-0000-4000-8000-000000000002'),0,
'pending attendance awards no points');

update public.volunteer_contributions
set status='approved',approved_minutes=900
where attendance_session_id='93300000-0000-4000-8000-000000000006';
select is((select sum(points_delta) from gamification.point_ledger_entries
where volunteer_id='93300000-0000-4000-8000-000000000002'),220::numeric,
'first 15 approved hours award 150 + 20 + 50');
select is((select count(*)::integer from gamification.volunteer_badges b
join gamification.badge_definitions d on d.id=b.badge_id
where b.volunteer_id='93300000-0000-4000-8000-000000000002'
and b.revoked_at is null and d.stable_key in ('first-step','helping-hand-15')),2,
'first contribution and 15-hour badges show on profile');

update public.volunteer_contributions set approved_minutes=600
where attendance_session_id='93300000-0000-4000-8000-000000000006';
select is((select sum(points_delta) from gamification.point_ledger_entries
where volunteer_id='93300000-0000-4000-8000-000000000002'),120::numeric,
'correction below 15 hours reverses hours and milestone points');
select is((select count(*)::integer from gamification.volunteer_badges b
join gamification.badge_definitions d on d.id=b.badge_id
where b.volunteer_id='93300000-0000-4000-8000-000000000002'
and b.revoked_at is null and d.stable_key='helping-hand-15'),0,
'15-hour badge is revoked after correction');

select set_config('request.jwt.claim.sub','93300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"93300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;
select is(core.record_volunteer_engagement('opportunity_view','recognition-test'),2::numeric,
'viewing a published opportunity earns two points');
select is(core.record_volunteer_engagement('opportunity_view','recognition-test'),0::numeric,
'weekly opportunity award cannot repeat');
select is(core.record_volunteer_engagement('profile_review'),2::numeric,
'confirming current profile awards two monthly points');
reset role;

select * from finish();
rollback;
