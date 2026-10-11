begin;
select plan(6);
insert into auth.users(id,email) values ('77000000-0000-4000-8000-000000000001','attendance-regression@example.test');
insert into public.phaseone_events(id,title,slug,created_by,updated_by)
values ('77000000-0000-4000-8000-000000000002','Attendance correction regression','attendance-correction-regression','77000000-0000-4000-8000-000000000001','77000000-0000-4000-8000-000000000001');
insert into public.phaseone_event_timeslots(id,event_id,label,starts_at,ends_at,sort_order)
values ('77000000-0000-4000-8000-000000000003','77000000-0000-4000-8000-000000000002','AM','2026-10-13 02:00+00','2026-10-13 06:00+00',1);
insert into public.phaseone_roster(id,event_id,timeslot_id,volunteer_key,volunteer_name,email,uploaded_by)
values ('77000000-0000-4000-8000-000000000010','77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000003','MV-VOID01','Test Volunteer','test-attendance-regression@example.test','77000000-0000-4000-8000-000000000001');

select public.phaseone_apply_attendance_transition('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000010','mark_sign_in','2026-10-13 02:05+00','Test check-in','77000000-0000-4000-8000-000000000001');
select public.phaseone_apply_attendance_transition('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000010','mark_sign_out','2026-10-13 05:05+00','Test check-out','77000000-0000-4000-8000-000000000001');
select public.phaseone_apply_attendance_change('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000010','clear_sign_out',null,'Correct test checkout','77000000-0000-4000-8000-000000000001');
select public.phaseone_apply_attendance_change('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000010','clear_sign_in',null,'Correct test checkin','77000000-0000-4000-8000-000000000001');

select is((select signed_in_at from public.phaseone_attendance_effective where roster_id='77000000-0000-4000-8000-000000000010'),null::timestamptz,'effective status clears');
select is((select count(*)::int from public.phaseone_attendance_session_shifts where event_id='77000000-0000-4000-8000-000000000002'),0,'void detaches shifts');
select is((select count(*)::int from public.phaseone_attendance_session_audit where event_id='77000000-0000-4000-8000-000000000002' and action='session_voided'),1,'void audit preserved');
select public.phaseone_apply_attendance_transition('77000000-0000-4000-8000-000000000002','77000000-0000-4000-8000-000000000010','mark_sign_in','2026-10-13 02:10+00','Test genuine return','77000000-0000-4000-8000-000000000001');
select is((select count(*)::int from public.phaseone_attendance_sessions where event_id='77000000-0000-4000-8000-000000000002'),1,'return reuses session');
select is((select signed_in_at from public.phaseone_attendance_effective where roster_id='77000000-0000-4000-8000-000000000010'),'2026-10-13 02:10+00'::timestamptz,'return visibly checked in');
select is((select count(*)::int from public.phaseone_attendance_session_audit where event_id='77000000-0000-4000-8000-000000000002' and action='session_opened'),2,'both check-ins audited');
select * from finish();
rollback;
