begin;

select plan(14);

select has_column(
  'public',
  'volunteers',
  'profile_origin',
  'MakLom profiles record their provisioning origin'
);

select has_function(
  'core',
  'ensure_maklom_profile_extension',
  array['uuid','text'],
  'MakLom profile extension invariant helper exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'core.ensure_maklom_profile_extension(uuid,text)',
    'EXECUTE'
  ),
  'browser clients cannot create MakLom profile extensions directly'
);

insert into auth.users(id,email,email_confirmed_at)
values (
  '99700000-0000-4000-8000-000000000001',
  'profile-invariant-account@example.test',
  now()
);

select set_config(
  'request.jwt.claim.sub',
  '99700000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"99700000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'created',
  'verified KELUARGA account creates its canonical volunteer'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.volunteers profile
    join core.volunteers volunteer
      on volunteer.id=profile.core_volunteer_id
    where volunteer.auth_user_id='99700000-0000-4000-8000-000000000001'
  ),
  1,
  'native account provisioning also creates one MakLom profile'
);

select is(
  (
    select profile.profile_origin
    from public.volunteers profile
    join core.volunteers volunteer
      on volunteer.id=profile.core_volunteer_id
    where volunteer.auth_user_id='99700000-0000-4000-8000-000000000001'
  ),
  'keluarga_account',
  'native account MakLom profile retains KELUARGA account provenance'
);

set local role authenticated;

select is(
  core.ensure_current_keluarga_volunteer(),
  'already_linked',
  'repeated account provisioning reuses the canonical volunteer'
);

reset role;

set local role service_role;

select lives_ok(
  $$
    select core.resolve_manual_roster_volunteer(
      null,
      'Profile Invariant Manual Volunteer',
      'profile-invariant-manual@example.test',
      '81239999',
      30::smallint
    )
  $$,
  'integrated manual roster creation resolves a canonical volunteer'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.volunteers profile
    join core.volunteers volunteer
      on volunteer.id=profile.core_volunteer_id
    where volunteer.primary_email_normalized='profile-invariant-manual@example.test'
  ),
  1,
  'manual roster creation also creates one MakLom profile'
);

select is(
  (
    select profile.profile_origin
    from public.volunteers profile
    join core.volunteers volunteer
      on volunteer.id=profile.core_volunteer_id
    where volunteer.primary_email_normalized='profile-invariant-manual@example.test'
  ),
  'keluarga_manual_roster',
  'manual roster MakLom profile retains roster provenance'
);

set local role service_role;

select lives_ok(
  $$
    select core.resolve_manual_roster_volunteer(
      null,
      'Profile Invariant Manual Volunteer',
      'profile-invariant-manual@example.test',
      '81239999',
      30::smallint
    )
  $$,
  'repeated integrated manual roster resolution remains idempotent'
);

reset role;

select is(
  (
    select count(*)::integer
    from core.volunteers
    where primary_email_normalized='profile-invariant-manual@example.test'
  ),
  1,
  'repeated manual resolution does not duplicate canonical volunteers'
);

select is(
  (
    select count(*)::integer
    from public.volunteers profile
    join core.volunteers volunteer
      on volunteer.id=profile.core_volunteer_id
    where volunteer.primary_email_normalized='profile-invariant-manual@example.test'
  ),
  1,
  'repeated manual resolution does not duplicate MakLom profiles'
);

select is(
  (
    select count(*)::integer
    from core.volunteers volunteer
    where not exists (
      select 1
      from public.volunteers profile
      where profile.core_volunteer_id=volunteer.id
    )
      and (
        volunteer.auth_user_id is not null
        or exists (
          select 1
          from public.phaseone_roster roster
          where roster.volunteer_id=volunteer.id
        )
      )
  ),
  0,
  'all KELUARGA account-linked or roster-linked canonical volunteers have MakLom profiles'
);

select * from finish();
rollback;
