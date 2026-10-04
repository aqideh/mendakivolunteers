begin;

select plan(26);

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

reset role;

insert into core.volunteers(
  id,
  display_name,
  primary_email_normalized,
  account_access_eligible
)
values (
  '99600000-0000-4000-8000-000000000010',
  'Existing Legacy Volunteer',
  'existing-link@example.test',
  false
);

insert into auth.users(
  id,
  email,
  email_confirmed_at
)
values (
  '99600000-0000-4000-8000-000000000011',
  'existing-link@example.test',
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '99600000-0000-4000-8000-000000000011',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99600000-0000-4000-8000-000000000011","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'linked_existing',
  'verified signup reuses a unique existing volunteer even when legacy eligibility is false'
);

select is(
  (
    select auth_user_id
    from core.volunteers
    where id = '99600000-0000-4000-8000-000000000010'
  ),
  '99600000-0000-4000-8000-000000000011'::uuid,
  'existing canonical volunteer receives the auth account instead of creating a duplicate'
);


reset role;

insert into auth.users(id,email,email_confirmed_at)
values
  ('99600000-0000-4000-8000-000000000020','history-old@example.test',now()),
  ('99600000-0000-4000-8000-000000000021','history-new@example.test',now()),
  ('99600000-0000-4000-8000-000000000022','review-admin@example.test',now());

update core.user_accounts
set status='active'
where id='99600000-0000-4000-8000-000000000022';

insert into core.user_roles(user_id, role, reason)
values (
  '99600000-0000-4000-8000-000000000022',
  'admin',
  'pgTAP reconciliation manager'
)
on conflict (user_id, role) do nothing;

select set_config('request.jwt.claim.sub','99600000-0000-4000-8000-000000000020',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"99600000-0000-4000-8000-000000000020","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'historical login provisions its canonical volunteer'
);

reset role;

select set_config('request.jwt.claim.sub','99600000-0000-4000-8000-000000000021',true);
select set_config(
  'request.jwt.claims',
  '{"sub":"99600000-0000-4000-8000-000000000021","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'new verified login provisions a separate volunteer before changed-email reconciliation'
);

reset role;

update core.volunteers
set display_name='Same Volunteer', mobile='81234567'
where auth_user_id in (
  '99600000-0000-4000-8000-000000000020',
  '99600000-0000-4000-8000-000000000021'
);

insert into public.keluarga_volunteer_profiles(
  volunteer_id,
  bio,
  interests,
  skills,
  availability_slots,
  preferred_commitment,
  onboarding_completed_at
)
select id,'Current profile',array['youth'],array['facilitation'],
       array['saturday'],'monthly',now()
from core.volunteers
where auth_user_id='99600000-0000-4000-8000-000000000021';

insert into public.volunteer_private_details(
  volunteer_id,
  date_of_birth,
  postal_code,
  address_line,
  tshirt_size,
  highest_qualification,
  institution,
  languages_spoken,
  emergency_contact_name,
  emergency_contact_mobile
)
select id,'2000-01-01','560123','Test address','M','diploma','Test Institute',
       array['English'],'Emergency Contact','81230000'
from core.volunteers
where auth_user_id='99600000-0000-4000-8000-000000000021';

insert into core.account_link_cases(
  auth_user_id,
  status,
  reason_code,
  candidate_volunteer_id,
  submitted_for_review_at
)
select
  '99600000-0000-4000-8000-000000000021',
  'needs_review',
  'verified_name_mobile_match',
  old_volunteer.id,
  now()
from core.volunteers old_volunteer
where old_volunteer.auth_user_id='99600000-0000-4000-8000-000000000020';

select lives_ok(
  format(
    $sql$
      select core.merge_reconciled_volunteer_identity(
        %L::uuid,
        %L::uuid,
        'current',
        '99600000-0000-4000-8000-000000000022'::uuid,
        'pgTAP changed-email merge'
      )
    $sql$,
    (
      select id
      from core.account_link_cases
      where auth_user_id='99600000-0000-4000-8000-000000000021'
        and reason_code='verified_name_mobile_match'
    ),
    (
      select id
      from core.volunteers
      where auth_user_id='99600000-0000-4000-8000-000000000020'
    )
  ),
  'reviewed changed-email identities can be merged while keeping the current login'
);

select is(
  (
    select count(*)::integer
    from core.volunteers
    where auth_user_id='99600000-0000-4000-8000-000000000021'
  ),
  1,
  'current verified login owns exactly one volunteer after merge'
);

select is(
  (
    select status::text
    from core.user_accounts
    where id='99600000-0000-4000-8000-000000000020'
  ),
  'closed',
  'superseded historical login is closed'
);

select is(
  (
    select count(*)::integer
    from core.volunteer_aliases
    where source_system='keluarga_merged_code'
      and volunteer_id=(
        select id from core.volunteers
        where auth_user_id='99600000-0000-4000-8000-000000000021'
      )
  ),
  1,
  'retired duplicate KEL code is preserved as a merged alias'
);

select is(
  (
    select review_outcome
    from core.account_link_cases
    where auth_user_id='99600000-0000-4000-8000-000000000021'
  ),
  'merged_existing',
  'identity review case is resolved as a merge'
);

select is(
  (
    select bio
    from public.keluarga_volunteer_profiles
    where volunteer_id=(
      select id from core.volunteers
      where auth_user_id='99600000-0000-4000-8000-000000000021'
    )
  ),
  'Current profile',
  'current onboarding profile is preserved on the surviving historical volunteer'
);

select * from finish();
rollback;
