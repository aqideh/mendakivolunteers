begin;
select no_plan();

-- Synthetic fixtures only; the entire test file is rolled back.
insert into auth.users(id,email) values
 ('7fa10000-0000-4000-8000-000000000001','direct-correction-editor@example.test'),
 ('7fa10000-0000-4000-8000-000000000002','direct-correction-reader@example.test');
insert into public.app_members(user_id,role,active) values
 ('7fa10000-0000-4000-8000-000000000001','admin',true),
 ('7fa10000-0000-4000-8000-000000000002','viewer',true);
insert into public.phaseone_events(id,title,slug,created_by,updated_by) values
 ('7fa10000-0000-4000-8000-000000000003','Direct correction safety test','direct-correction-safety-test',
  '7fa10000-0000-4000-8000-000000000001','7fa10000-0000-4000-8000-000000000001');
insert into public.phaseone_event_timeslots(id,event_id,label,starts_at,ends_at) values
 ('7fa10000-0000-4000-8000-000000000004','7fa10000-0000-4000-8000-000000000003','Test shift',
  '2026-08-27T01:00:00Z','2026-08-27T10:00:00Z');
insert into public.phaseone_roster(id,event_id,timeslot_id,volunteer_key,volunteer_name,uploaded_by) values
 ('7fa10000-0000-4000-8000-000000000005','7fa10000-0000-4000-8000-000000000003',
  '7fa10000-0000-4000-8000-000000000004','DIRECT-CORRECTION-TEST','Synthetic direct attendance',
  '7fa10000-0000-4000-8000-000000000001');
insert into public.phaseone_attendance(event_id,roster_id,signed_in_at,signed_out_at,updated_at) values
 ('7fa10000-0000-4000-8000-000000000003','7fa10000-0000-4000-8000-000000000005',
  '2026-08-27T02:16:37.123456Z','2026-08-27T04:50:42.654321Z','2026-10-01T00:00:00Z');
select set_config('request.jwt.claim.sub','7fa10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"7fa10000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005','2026-10-01T00:00:00Z',
 '2026-08-27T02:15:00Z','2026-08-27T04:50:42.654321Z','Correct sign-in only')$q$,
 'authenticated editor can correct check-in without a continuous session');
reset role;
select is((select signed_in_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T02:15:00Z'::timestamptz,'requested sign-in is saved');
select is((select signed_out_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T04:50:42.654321Z'::timestamptz,'sign-in-only correction retains checkout to microsecond precision');
select is((select count(*) from public.phaseone_attendance_audit where roster_id='7fa10000-0000-4000-8000-000000000005'),
 3::bigint,'clear, check-in change and restored checkout retain an audit trail');

select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T02:15:00Z','2026-08-27T04:50:42.654321Z','Unchanged interval save')$q$,
 'unchanged interval is accepted without rewriting timestamps');
select is((select count(*) from public.phaseone_attendance_audit where roster_id='7fa10000-0000-4000-8000-000000000005'),
 3::bigint,'unchanged save does not add spurious attendance changes');

select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T02:15:00Z','2026-08-27T05:00:11.123456Z','Correct checkout only')$q$,
 'checkout-only correction succeeds');
select is((select signed_in_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T02:15:00Z'::timestamptz,'checkout-only correction retains check-in');
select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Move both corrected timestamps')$q$,
 'both timestamps can move beyond the previous checkout without an intermediate chronology error');
select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T06:00:00Z',null,'Deliberately remove unsupported checkout')$q$,
 'an explicitly cleared checkout stays cleared');
select is((select signed_out_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 null::timestamptz,'deliberate checkout clearing is respected');
select lives_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Supply reviewed checkout evidence')$q$,
 'a missing checkout can be supplied');

select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005','2000-01-01T00:00:00Z',
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Stale editor submission')$q$,
 'P1202','Attendance changed. Refresh before correcting it','stale attendance uses a non-retryable conflict code');
select throws_ok($q$select public.maklom_event_save_schedule(
 '7fa10000-0000-4000-8000-000000000003','2000-01-01T00:00:00Z','[{}]'::jsonb,'Stale schedule submission')$q$,
 'P1202','The event has changed. Refresh before changing its schedule','stale schedule uses a non-retryable conflict code');
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',now(),
 '2026-08-27T09:00:00Z','2026-08-27T08:00:00Z','Invalid chronology')$q$,
 '22023','Valid sign-in, sign-out and current record version are required','checkout before check-in is rejected');
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',now(),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','')$q$,
 '22023','A correction reason between 5 and 500 characters is required','audit reason is mandatory');
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',now(),
 'infinity'::timestamptz,null,'Invalid infinite timestamp')$q$,
 '22023','Valid sign-in, sign-out and current record version are required','infinite timestamps are rejected');

-- Force failure on the last write and verify the earlier clear/check-in roll back.
create function pg_temp.reject_test_checkout_audit() returns trigger language plpgsql as $$
begin
  if new.roster_id='7fa10000-0000-4000-8000-000000000005' and new.action='mark_sign_out' then
    raise exception 'Synthetic audit failure' using errcode='P1299';
  end if;
  return new;
end; $$;
create trigger test_reject_checkout_audit before insert on public.phaseone_attendance_audit
 for each row execute function pg_temp.reject_test_checkout_audit();
create temporary table correction_audit_before as select count(*) n from public.phaseone_attendance_audit
 where roster_id='7fa10000-0000-4000-8000-000000000005';
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',
 (select updated_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T06:05:00Z','2026-08-27T08:00:00Z','Force rollback after checkout restoration')$q$,
 'P1299','Synthetic audit failure','audit failure rejects the entire correction');
select is((select signed_in_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T06:00:00Z'::timestamptz,'check-in is rolled back on audit failure');
select is((select signed_out_at from public.phaseone_attendance where roster_id='7fa10000-0000-4000-8000-000000000005'),
 '2026-08-27T08:00:00Z'::timestamptz,'checkout is rolled back on audit failure');
select is((select count(*) from public.phaseone_attendance_audit where roster_id='7fa10000-0000-4000-8000-000000000005'),
 (select n from correction_audit_before),'no partial audit entries survive a failed correction');
drop trigger test_reject_checkout_audit on public.phaseone_attendance_audit;

select set_config('request.jwt.claim.sub','7fa10000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"7fa10000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;
-- Access-model deployments use different wording; permission denial is the contract.
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',now(),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Unauthorised correction attempt')$q$,
 '42501',null::text,'a reader cannot call the correction RPC directly');
reset role;
select ok(not has_function_privilege('anon',
 'public.maklom_event_correct_direct_roster_attendance(uuid,timestamptz,timestamptz,timestamptz,text)','EXECUTE'),
 'anonymous callers cannot execute the correction');
select set_config('request.jwt.claim.sub','7fa10000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"7fa10000-0000-4000-8000-000000000001","role":"authenticated"}',true);
select throws_ok($q$select maklom_domain.correct_direct_roster_attendance_impl(
 '7fa10000-0000-4000-8000-000000000005',now(),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Actor mismatch attempt','7fa10000-0000-4000-8000-000000000002')$q$,
 '42501','Authentication context mismatch','the implementation rejects a forged actor');

insert into public.phaseone_attendance_sessions(id,event_id,attendance_date,person_key,origin_roster_id,checked_in_at,checked_out_at)
 select '7fa10000-0000-4000-8000-000000000006',event_id,'2026-08-27',attendance_person_key,id,
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z' from public.phaseone_roster where id='7fa10000-0000-4000-8000-000000000005';
insert into public.phaseone_attendance_session_shifts(session_id,event_id,roster_id,timeslot_id,continuation_type)
 values('7fa10000-0000-4000-8000-000000000006','7fa10000-0000-4000-8000-000000000003',
 '7fa10000-0000-4000-8000-000000000005','7fa10000-0000-4000-8000-000000000004','origin');
select throws_ok($q$select public.maklom_event_correct_direct_roster_attendance(
 '7fa10000-0000-4000-8000-000000000005',now(),
 '2026-08-27T06:00:00Z','2026-08-27T08:00:00Z','Wrong correction entry point')$q$,
 'P1203','This record has a linked session; correct the session instead','direct editor cannot change a linked session indirectly');
select * from finish();
rollback;
