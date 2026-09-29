begin;

select plan(5);

select has_function(
  'maklom_private',
  'audit_volunteer_contribution',
  array[]::text[],
  'private contribution audit trigger function exists'
);

select ok(
  not has_table_privilege('authenticated','public.volunteer_contribution_audit','INSERT'),
  'authenticated users cannot forge contribution audit rows directly'
);

insert into auth.users(id,email,email_confirmed_at)
values ('99300000-0000-4000-8000-000000000001','audit-editor@example.test',now());

insert into public.app_members(user_id,role,active)
values ('99300000-0000-4000-8000-000000000001','editor',true);

insert into core.volunteers(
  id,display_name,primary_email_normalized,account_access_eligible
) values (
  '99300000-0000-4000-8000-000000000002',
  'Audit Test Volunteer',
  'audit-volunteer@example.test',
  true
);

insert into public.phaseone_events(
  id,title,slug,created_by,updated_by
) values (
  '99300000-0000-4000-8000-000000000003',
  'Contribution audit trigger test',
  'contribution-audit-trigger-test',
  '99300000-0000-4000-8000-000000000001',
  '99300000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,event_id,label,starts_at,ends_at,status,sort_order
) values (
  '99300000-0000-4000-8000-000000000004',
  '99300000-0000-4000-8000-000000000003',
  'Main shift',
  '2026-10-15 09:00:00+08',
  '2026-10-15 11:00:00+08',
  'scheduled',
  0
);

insert into public.phaseone_roster(
  id,event_id,timeslot_id,volunteer_key,volunteer_name,email,volunteer_id,uploaded_by
) values (
  '99300000-0000-4000-8000-000000000005',
  '99300000-0000-4000-8000-000000000003',
  '99300000-0000-4000-8000-000000000004',
  'AUDIT-001',
  'Audit Test Volunteer',
  'audit-volunteer@example.test',
  '99300000-0000-4000-8000-000000000002',
  '99300000-0000-4000-8000-000000000001'
);

insert into public.phaseone_attendance_sessions(
  id,event_id,attendance_date,person_key,origin_roster_id,checked_in_at,checked_out_at
) values (
  '99300000-0000-4000-8000-000000000006',
  '99300000-0000-4000-8000-000000000003',
  '2026-10-15',
  'id:audit-001',
  '99300000-0000-4000-8000-000000000005',
  '2026-10-15 09:00:00+08',
  '2026-10-15 11:00:00+08'
);

select ok(
  exists(
    select 1
    from public.volunteer_contributions
    where attendance_session_id='99300000-0000-4000-8000-000000000006'
      and status='pending'
  ),
  'completed attendance creates pending contribution'
);

select set_config('request.jwt.claim.sub','99300000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99300000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $$
    update public.volunteer_contributions
    set status='approved',
        approved_minutes=120,
        approval_note='Audit trigger regression test'
    where attendance_session_id='99300000-0000-4000-8000-000000000006'
  $$,
  'MakLom editor can approve contribution while audit trigger appends history'
);

select is(
  (
    select changed_by
    from public.volunteer_contribution_audit
    where contribution_id=(
      select id from public.volunteer_contributions
      where attendance_session_id='99300000-0000-4000-8000-000000000006'
    )
      and new_status='approved'
    order by changed_at desc
    limit 1
  ),
  '99300000-0000-4000-8000-000000000001'::uuid,
  'audit history records the authenticated MakLom reviewer'
);

reset role;

select * from finish();
rollback;
