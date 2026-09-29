begin;

select plan(13);

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
values
  ('99400000-0000-4000-8000-000000000001','e2e-regression-staff@example.test',now()),
  ('99400000-0000-4000-8000-000000000002','e2e-regression-volunteer@example.test',now());

update core.user_accounts
set status='active',display_name='E2E Regression Staff'
where id='99400000-0000-4000-8000-000000000001';

insert into core.user_roles(user_id,role,granted_by,reason)
values(
  '99400000-0000-4000-8000-000000000001',
  'admin',
  '99400000-0000-4000-8000-000000000001',
  'Shared-platform regression test'
)
on conflict do nothing;

insert into public.app_members(user_id,role,active)
values('99400000-0000-4000-8000-000000000001','admin',true)
on conflict(user_id) do update set role='admin',active=true;

insert into public.volunteer_leads(
  id,source,source_form_id,source_submission_id,submitted_at,status,
  full_name,email,phone,interest_area,raw_payload
) values(
  'lead_shared_platform_e2e',
  'formsg',
  'shared-platform-e2e-form',
  'shared-platform-e2e-submission',
  now(),
  'accepted',
  'Shared Platform Volunteer',
  'e2e-regression-volunteer@example.test',
  '91234567',
  'Contributor',
  '{"regression":true}'::jsonb
);

select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $$select public.maklom_convert_volunteer_lead('lead_shared_platform_e2e')$$,
  'MakLom converts an accepted FormSG lead'
);

reset role;

select ok(
  exists(
    select 1
    from public.volunteer_leads l
    join public.volunteers p on p.id=l.converted_volunteer_id
    join core.volunteers c on c.id=l.keluarga_volunteer_id
    where l.id='lead_shared_platform_e2e'
      and l.status='converted'
      and p.core_volunteer_id=c.id
  ),
  'lead conversion creates one shared canonical identity'
);

select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $$select core.ensure_current_keluarga_volunteer()$$,
  'verified KELUARGA account links to the converted canonical volunteer'
);

reset role;

select is(
  (select id from core.volunteers where auth_user_id='99400000-0000-4000-8000-000000000002'),
  (select keluarga_volunteer_id from public.volunteer_leads where id='lead_shared_platform_e2e'),
  'KELUARGA account and MakLom lead resolve to the same canonical UUID'
);

insert into public.phaseone_events(
  id,title,slug,reporting_at,venue,is_opportunity_published,
  opportunity_summary,registration_deadline,created_by,updated_by
) values(
  '99400000-0000-4000-8000-000000000010',
  'Shared platform regression event',
  'shared-platform-regression-event',
  '2026-10-16 09:00:00+08',
  'Regression venue',
  true,
  'Rollback-only shared-platform regression event',
  '2026-10-15 23:59:00+08',
  '99400000-0000-4000-8000-000000000001',
  '99400000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,event_id,label,starts_at,ends_at,status,sort_order,registration_capacity
) values(
  '99400000-0000-4000-8000-000000000011',
  '99400000-0000-4000-8000-000000000010',
  'Main shift',
  '2026-10-16 09:00:00+08',
  '2026-10-16 11:00:00+08',
  'scheduled',
  0,
  20
);

select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $$select core.submit_keluarga_registration(
    '99400000-0000-4000-8000-000000000010',
    array['99400000-0000-4000-8000-000000000011']::uuid[]
  )$$,
  'volunteer submits a KELUARGA opportunity registration'
);

reset role;

select is(
  core.review_keluarga_registration(
    (select id from public.keluarga_registrations where event_id='99400000-0000-4000-8000-000000000010'),
    'confirmed',
    'Shared-platform regression confirmation',
    '99400000-0000-4000-8000-000000000001'
  ),
  'confirmed',
  'staff confirms the KELUARGA registration'
);

select ok(
  exists(
    select 1
    from public.phaseone_roster r
    join public.keluarga_registrations kr on kr.id=r.registration_id
    where r.event_id='99400000-0000-4000-8000-000000000010'
      and r.timeslot_id='99400000-0000-4000-8000-000000000011'
      and r.entry_method='keluarga_registration'
      and r.volunteer_id=kr.volunteer_id
  ),
  'confirmed registration populates Event Operations with canonical identity'
);

select public.phaseone_apply_attendance_transition(
  '99400000-0000-4000-8000-000000000010',
  (select id from public.phaseone_roster where event_id='99400000-0000-4000-8000-000000000010' limit 1),
  'mark_sign_in',
  '2026-10-16 09:00:00+08',
  'Shared-platform regression check-in',
  '99400000-0000-4000-8000-000000000001'
);

select public.phaseone_apply_attendance_transition(
  '99400000-0000-4000-8000-000000000010',
  (select id from public.phaseone_roster where event_id='99400000-0000-4000-8000-000000000010' limit 1),
  'mark_sign_out',
  '2026-10-16 11:00:00+08',
  'Shared-platform regression check-out',
  '99400000-0000-4000-8000-000000000001'
);

select ok(
  exists(
    select 1 from public.volunteer_contributions
    where event_id='99400000-0000-4000-8000-000000000010'
      and status='pending'
      and operational_minutes=120
  ),
  'completed attendance automatically creates a pending MakLom contribution'
);

select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"99400000-0000-4000-8000-000000000001","role":"authenticated"}',true);
set local role authenticated;

select lives_ok(
  $$
    update public.volunteer_contributions
    set status='approved',
        approved_minutes=120,
        approval_note='Shared-platform regression approval'
    where event_id='99400000-0000-4000-8000-000000000010'
  $$,
  'MakLom reviewer approves the contribution'
);

select is(
  (
    select changed_by
    from public.volunteer_contribution_audit
    where contribution_id=(
      select id from public.volunteer_contributions
      where event_id='99400000-0000-4000-8000-000000000010'
    )
      and new_status='approved'
    order by changed_at desc
    limit 1
  ),
  '99400000-0000-4000-8000-000000000001'::uuid,
  'approval audit records the MakLom reviewer'
);

reset role;

select set_config('request.jwt.claim.sub','99400000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"99400000-0000-4000-8000-000000000002","role":"authenticated"}',true);
set local role authenticated;

select is(
  (
    select coalesce(sum(approved_minutes),0)::integer
    from public.volunteer_contributions
    where status='approved'
  ),
  120,
  'volunteer RLS exposes the approved 120 minutes used by the dashboard'
);

reset role;

select * from finish();
rollback;
