begin;

select plan(16);

select has_column(
  'core',
  'account_link_cases',
  'candidate_volunteer_id',
  'review cases can store a deferred canonical match'
);
select has_column(
  'core',
  'account_link_cases',
  'review_outcome',
  'review cases store an administrative outcome'
);
select has_column(
  'core',
  'account_link_cases',
  'requested_sections',
  'review cases store requested profile sections'
);
select has_column(
  'core',
  'account_link_cases',
  'volunteer_message',
  'review cases store a volunteer-facing message'
);
select has_column(
  'core',
  'account_link_cases',
  'submitted_for_review_at',
  'review cases track profile submission time'
);
select has_column(
  'core',
  'account_link_cases',
  'resubmitted_at',
  'review cases track volunteer resubmission time'
);

insert into auth.users(
  id,
  email,
  email_confirmed_at,
  raw_app_meta_data
)
values (
  '99600000-0000-4000-8000-000000000001',
  'temporary-review@example.test',
  now(),
  '{"keluarga_email_ownership_verified":false}'::jsonb
);

select set_config(
  'request.jwt.claim.sub',
  '99600000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99600000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created_unverified',
  'temporary password account provisions an isolated volunteer'
);

select is(
  (
    select count(*)::integer
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
      and status = 'pending'
      and reason_code = 'temporary_unverified_email'
  ),
  1,
  'temporary account receives one open administrative review case'
);

select is(
  (
    select primary_email_normalized
    from core.volunteers
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
  ),
  null,
  'temporary volunteer remains isolated from email-based identity matching'
);

select is(
  (
    select count(*)::integer
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
  ),
  1,
  'volunteer can read their own review case through RLS'
);

reset role;
set local role service_role;

update core.account_link_cases
set
  status = 'needs_review',
  reason_code = 'profile_refill_required',
  review_outcome = 'refill_required',
  requested_sections = array['contact','skills']::text[],
  volunteer_message = 'Please check your contact details and skills.'
where auth_user_id = '99600000-0000-4000-8000-000000000001';

select is(
  (
    select review_outcome
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
  ),
  'refill_required',
  'administrator can record a refill outcome'
);

select is(
  (
    select requested_sections
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
  ),
  array['contact','skills']::text[],
  'requested profile sections are stored'
);

select is(
  (
    select volunteer_message
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000001'
  ),
  'Please check your contact details and skills.',
  'volunteer-facing review guidance is stored'
);

reset role;

insert into auth.users(
  id,
  email,
  email_confirmed_at
)
values (
  '99600000-0000-4000-8000-000000000002',
  'verified-review@example.test',
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '99600000-0000-4000-8000-000000000002',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99600000-0000-4000-8000-000000000002","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'genuinely verified account keeps the established verified flow'
);

select is(
  (
    select primary_email_normalized
    from core.volunteers
    where auth_user_id = '99600000-0000-4000-8000-000000000002'
  ),
  'verified-review@example.test',
  'verified volunteer retains its email identity'
);

select is(
  (
    select count(*)::integer
    from core.account_link_cases
    where auth_user_id = '99600000-0000-4000-8000-000000000002'
      and reason_code = 'temporary_unverified_email'
  ),
  0,
  'verified account does not receive a temporary review case'
);

select * from finish();
rollback;
