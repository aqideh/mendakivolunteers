begin;

select plan(29);

select has_table('public', 'keluarga_recruitment_applications', 'recruitment applications table exists');
select has_table('public', 'keluarga_recruitment_status_history', 'recruitment status history exists');
select has_table('public', 'keluarga_contribution_credits', 'manual contribution credit ledger exists');
select has_column('public', 'phaseone_events', 'operations_scope', 'events declare their operations data scope');
select has_column('public', 'phaseone_events', 'credit_contribution_hours', 'manual events can opt into contribution-hour crediting');
select has_column('public', 'phaseone_roster_imports', 'integration_mode', 'roster imports retain integration provenance');

select ok(
  'withdrawn' = any(enum_range(null::public.keluarga_registration_status)::text[]),
  'registration lifecycle includes volunteer withdrawal'
);

select ok(
  has_function_privilege(
    'authenticated',
    'core.submit_keluarga_recruitment_application(text,text,text,text,text)',
    'EXECUTE'
  ),
  'authenticated volunteers can submit recruitment intake through the controlled RPC'
);
select ok(
  has_function_privilege(
    'authenticated',
    'core.withdraw_keluarga_recruitment_application(uuid)',
    'EXECUTE'
  ),
  'authenticated volunteers can withdraw their recruitment intake'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'core.review_keluarga_recruitment_application(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'browser clients cannot perform staff recruitment review'
);
select ok(
  has_function_privilege(
    'authenticated',
    'core.withdraw_keluarga_registration(uuid,text)',
    'EXECUTE'
  ),
  'authenticated volunteers can withdraw their own programme registration'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'core.cancel_keluarga_registration(uuid,text,uuid)',
    'EXECUTE'
  ),
  'browser clients cannot perform staff registration cancellation'
);
select ok(
  has_table_privilege('authenticated', 'public.keluarga_recruitment_applications', 'SELECT'),
  'authenticated volunteers can read recruitment rows subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.keluarga_recruitment_applications', 'INSERT'),
  'browser clients cannot bypass recruitment submission RPC'
);
select ok(
  has_table_privilege('authenticated', 'public.keluarga_contribution_credits', 'SELECT'),
  'authenticated volunteers can read their app-owned contribution credits subject to RLS'
);
select ok(
  not has_table_privilege('authenticated', 'public.keluarga_contribution_credits', 'INSERT'),
  'browser clients cannot create contribution credits directly'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_apply_manual_roster_import(uuid,text,text,jsonb,uuid,boolean)',
    'EXECUTE'
  ),
  'service role can apply manual roster imports'
);
select ok(
  has_function_privilege(
    'service_role',
    'public.phaseone_add_manual_walk_in_volunteer(uuid,uuid,text,text,text,text,smallint,text,text,boolean,uuid,boolean)',
    'EXECUTE'
  ),
  'service role can add manual-event walk-ins'
);
select ok(
  has_function_privilege(
    'service_role',
    'core.refresh_manual_event_contribution_credits(uuid,uuid)',
    'EXECUTE'
  ),
  'service role can reconcile app-owned contribution credits'
);

insert into auth.users(id, email, email_confirmed_at)
values
  ('98000000-0000-4000-8000-000000000001', 'slice8-staff@example.test', now()),
  ('98000000-0000-4000-8000-000000000002', 'slice8-volunteer@example.test', now());

update core.user_accounts
set status = 'active'
where id = '98000000-0000-4000-8000-000000000001';

insert into core.user_roles(user_id, role, granted_by, reason)
values (
  '98000000-0000-4000-8000-000000000001',
  'attendance_manager',
  '98000000-0000-4000-8000-000000000001',
  'Slice 8 regression test'
);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'recruitment volunteer receives a native KELUARGA identity'
);

select lives_ok(
  $$
    select core.submit_keluarga_recruitment_application(
      'mentor',
      'I want to support young people through consistent mentoring.',
      'Peer mentoring and facilitation experience',
      'Saturday mornings',
      'KELUARGA website'
    )
  $$,
  'volunteer can submit app-owned recruitment intake'
);

select is(
  (
    select status::text
    from public.keluarga_recruitment_applications
    where volunteer_id = core.current_volunteer_id()
  ),
  'submitted',
  'recruitment intake starts submitted'
);

select is(
  core.withdraw_keluarga_recruitment_application(
    (
      select id
      from public.keluarga_recruitment_applications
      where volunteer_id = core.current_volunteer_id()
    )
  ),
  'withdrawn',
  'volunteer can withdraw an open recruitment intake'
);

reset role;

insert into public.phaseone_events(
  id,
  title,
  slug,
  venue,
  navigation_destination,
  opportunity_summary,
  is_opportunity_published,
  created_by,
  updated_by
)
values (
  '98000000-0000-4000-8000-000000000020',
  'Slice 8 registration reopen event',
  'slice-8-registration-reopen-event',
  'Test venue',
  'Test venue Singapore',
  'Registration lifecycle regression event.',
  true,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  status,
  sort_order
)
values (
  '98000000-0000-4000-8000-000000000021',
  '98000000-0000-4000-8000-000000000020',
  'Main shift',
  now() + interval '14 days',
  now() + interval '14 days 2 hours',
  'scheduled',
  0
);

select set_config('request.jwt.claim.sub', '98000000-0000-4000-8000-000000000002', true);
select set_config('request.jwt.claims', '{"sub":"98000000-0000-4000-8000-000000000002","role":"authenticated"}', true);
set local role authenticated;

select lives_ok(
  $$
    select core.submit_keluarga_registration(
      '98000000-0000-4000-8000-000000000020',
      array['98000000-0000-4000-8000-000000000021']::uuid[],
      'Slice Eight Volunteer',
      '91234567'
    )
  $$,
  'volunteer can register before testing withdrawal and reopening'
);

select is(
  core.withdraw_keluarga_registration(
    (
      select id
      from public.keluarga_registrations
      where event_id = '98000000-0000-4000-8000-000000000020'
        and volunteer_id = core.current_volunteer_id()
    ),
    'Plans changed'
  ),
  'withdrawn',
  'volunteer can withdraw a programme registration before attendance starts'
);

select lives_ok(
  $$
    select core.submit_keluarga_registration(
      '98000000-0000-4000-8000-000000000020',
      array['98000000-0000-4000-8000-000000000021']::uuid[],
      'Slice Eight Volunteer',
      '91234567'
    )
  $$,
  'withdrawn registration can be reopened while the opportunity remains available'
);

select is(
  (
    select status::text
    from public.keluarga_registrations
    where event_id = '98000000-0000-4000-8000-000000000020'
      and volunteer_id = core.current_volunteer_id()
  ),
  'pending',
  'reopened registration returns to pending review'
);

reset role;

insert into public.phaseone_events(
  id,
  title,
  slug,
  reporting_at,
  venue,
  operations_scope,
  credit_contribution_hours,
  created_by,
  updated_by
)
values (
  '98000000-0000-4000-8000-000000000010',
  'Slice 8 manual integrated event',
  'slice-8-manual-integrated-event',
  '2026-10-01 09:00:00+08',
  'Test venue',
  'manual_integrated',
  true,
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001'
);

insert into public.phaseone_event_timeslots(
  id,
  event_id,
  label,
  starts_at,
  ends_at,
  status,
  sort_order
)
values (
  '98000000-0000-4000-8000-000000000011',
  '98000000-0000-4000-8000-000000000010',
  'Main shift',
  '2026-10-01 09:00:00+08',
  '2026-10-01 11:00:00+08',
  'scheduled',
  0
);

set local role service_role;

select lives_ok(
  $$
    select public.phaseone_apply_manual_roster_import(
      '98000000-0000-4000-8000-000000000010',
      'merge',
      'slice8.csv',
      jsonb_build_array(
        jsonb_build_object(
          'timeslot_id', '98000000-0000-4000-8000-000000000011',
          'volunteer_key', null,
          'volunteer_name', 'Manual Integrated Volunteer',
          'email', 'manual-integrated@example.test',
          'mobile', '91234567',
          'age', 24,
          'tshirt_size', 'M',
          'dietary_requirements', null
        )
      ),
      '98000000-0000-4000-8000-000000000001',
      true
    )
  $$,
  'integrated CSV import can register or link a KELUARGA volunteer'
);

select ok(
  exists (
    select 1
    from public.phaseone_roster roster
    join core.volunteers volunteer on volunteer.id = roster.volunteer_id
    where roster.event_id = '98000000-0000-4000-8000-000000000010'
      and volunteer.primary_email_normalized = 'manual-integrated@example.test'
      and volunteer.volunteer_code ~ '^KEL[0-9]{5}$'
  ),
  'integrated CSV roster row is linked to a KELUARGA volunteer record'
);

select * from finish();
rollback;
