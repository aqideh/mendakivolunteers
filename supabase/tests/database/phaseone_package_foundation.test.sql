begin;

select plan(41);

select has_column(
  'public',
  'phaseone_events',
  'briefing_available_at',
  'events have a briefing release timestamp'
);
select has_column('public', 'phaseone_events', 'sign_in_pin_salt', 'events have a sign-in PIN salt');
select has_column('public', 'phaseone_events', 'sign_in_pin_hash', 'events have a sign-in PIN hash');
select has_column(
  'public',
  'phaseone_events',
  'sign_in_pin_updated_at',
  'events track sign-in PIN rotation'
);
select has_column('public', 'phaseone_events', 'sign_out_pin_salt', 'events have a sign-out PIN salt');
select has_column('public', 'phaseone_events', 'sign_out_pin_hash', 'events have a sign-out PIN hash');
select has_column(
  'public',
  'phaseone_events',
  'sign_out_pin_updated_at',
  'events track sign-out PIN rotation'
);
select has_column('public', 'phaseone_events', 'has_sign_in_pin', 'events expose a safe sign-in PIN flag');
select has_column('public', 'phaseone_events', 'has_sign_out_pin', 'events expose a safe sign-out PIN flag');
select has_column('public', 'phaseone_events', 'pin_salt', 'legacy PIN salt remains available');
select has_column('public', 'phaseone_events', 'pin_hash', 'legacy PIN hash remains available');
select has_column('public', 'phaseone_events', 'pin_updated_at', 'legacy PIN timestamp remains available');
select has_column('public', 'phaseone_pin_attempts', 'action_type', 'PIN attempts identify their action');

select is(
  (
    select is_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'phaseone_events'
      and column_name = 'has_sign_in_pin'
  ),
  'ALWAYS',
  'sign-in PIN flag is generated'
);

select is(
  (
    select is_generated
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'phaseone_events'
      and column_name = 'has_sign_out_pin'
  ),
  'ALWAYS',
  'sign-out PIN flag is generated'
);

select ok(
  not has_column_privilege('anon', 'public.phaseone_events', 'briefing_url', 'SELECT'),
  'anonymous clients cannot select briefing destinations'
);
select ok(
  not has_column_privilege('authenticated', 'public.phaseone_events', 'briefing_url', 'SELECT'),
  'authenticated clients cannot select briefing destinations'
);
select ok(
  has_column_privilege('anon', 'public.phaseone_events', 'has_sign_in_pin', 'SELECT'),
  'anonymous clients can select the sign-in PIN flag'
);
select ok(
  has_column_privilege('anon', 'public.phaseone_events', 'has_sign_out_pin', 'SELECT'),
  'anonymous clients can select the sign-out PIN flag'
);
select ok(
  has_column_privilege('authenticated', 'public.phaseone_events', 'has_sign_in_pin', 'SELECT'),
  'authenticated clients can select the sign-in PIN flag'
);
select ok(
  has_column_privilege('authenticated', 'public.phaseone_events', 'has_sign_out_pin', 'SELECT'),
  'authenticated clients can select the sign-out PIN flag'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'sign_in_pin_salt',
      'sign_in_pin_hash',
      'sign_in_pin_updated_at',
      'sign_out_pin_salt',
      'sign_out_pin_hash',
      'sign_out_pin_updated_at'
    ]) as sensitive_column(column_name)
    where has_column_privilege(
      'anon',
      'public.phaseone_events',
      sensitive_column.column_name,
      'SELECT'
    )
  ),
  'anonymous clients cannot select action-specific PIN material'
);

select ok(
  not exists (
    select 1
    from unnest(array[
      'sign_in_pin_salt',
      'sign_in_pin_hash',
      'sign_in_pin_updated_at',
      'sign_out_pin_salt',
      'sign_out_pin_hash',
      'sign_out_pin_updated_at'
    ]) as sensitive_column(column_name)
    where has_column_privilege(
      'authenticated',
      'public.phaseone_events',
      sensitive_column.column_name,
      'SELECT'
    )
  ),
  'authenticated clients cannot select action-specific PIN material'
);

select ok(
  has_column_privilege('anon', 'public.phaseone_events', 'briefing_available_at', 'SELECT'),
  'anonymous clients can select briefing release metadata'
);
select ok(
  has_column_privilege(
    'authenticated',
    'public.phaseone_events',
    'briefing_available_at',
    'SELECT'
  ),
  'authenticated clients can select briefing release metadata'
);

select ok(
  to_regclass('public.phaseone_events_published_reporting_at_idx') is not null,
  'published packages have a reporting-date index'
);
select ok(
  to_regclass('public.phaseone_pin_attempts_action_rate_limit_idx') is not null,
  'action-specific PIN failures have a rate-limit index'
);
select ok(
  to_regclass('public.phaseone_pin_attempts_rate_limit_idx') is not null,
  'the deployed legacy rate-limit index remains available'
);
select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.phaseone_events'::regclass
      and tgname = 'phaseone_events_sync_legacy_pin'
      and not tgisinternal
  ),
  'legacy PIN writes have a compatibility trigger'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.phaseone_sync_legacy_event_pin()',
    'EXECUTE'
  ),
  'anonymous clients cannot execute the compatibility trigger function'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.phaseone_sync_legacy_event_pin()',
    'EXECUTE'
  ),
  'authenticated clients cannot execute the compatibility trigger function'
);

insert into auth.users (id, email)
values (
  '70000000-0000-4000-8000-000000000001',
  'package-foundation@example.test'
);

insert into public.phaseone_events (
  id,
  title,
  slug,
  reporting_at,
  venue,
  navigation_destination,
  briefing_url,
  sign_in_url,
  sign_out_url,
  pin_salt,
  pin_hash,
  pin_updated_at,
  is_published,
  created_by,
  updated_by
)
values (
  '70000000-0000-4000-8000-000000000002',
  'Package foundation test',
  'package-foundation-test',
  '2026-08-15 01:00:00+00',
  'Test venue',
  '1 Test Street, Singapore 000001',
  'https://example.test/briefing',
  'https://example.test/sign-in',
  'https://example.test/sign-out',
  'legacy-salt',
  'legacy-hash',
  '2026-07-30 01:00:00+00',
  true,
  '70000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000001'
);

select ok(
  (
    select
      sign_in_pin_salt = 'legacy-salt'
      and sign_in_pin_hash = 'legacy-hash'
      and sign_in_pin_updated_at = '2026-07-30 01:00:00+00'
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'legacy event creation copies the sign-in PIN set'
);
select ok(
  (
    select
      sign_out_pin_salt = 'legacy-salt'
      and sign_out_pin_hash = 'legacy-hash'
      and sign_out_pin_updated_at = '2026-07-30 01:00:00+00'
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'legacy event creation copies the sign-out PIN set'
);
select ok(
  (
    select has_sign_in_pin and has_sign_out_pin
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'generated PIN indicators become true for a configured legacy PIN'
);

update public.phaseone_events
set
  pin_salt = 'rotated-salt',
  pin_hash = 'rotated-hash',
  pin_updated_at = '2026-07-30 02:00:00+00'
where id = '70000000-0000-4000-8000-000000000002';

select ok(
  (
    select
      sign_in_pin_hash = 'rotated-hash'
      and sign_out_pin_hash = 'rotated-hash'
      and sign_in_pin_updated_at = '2026-07-30 02:00:00+00'
      and sign_out_pin_updated_at = '2026-07-30 02:00:00+00'
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'legacy PIN rotation updates both action-specific PINs'
);

update public.phaseone_events
set pin_salt = null, pin_hash = null, pin_updated_at = null
where id = '70000000-0000-4000-8000-000000000002';

select ok(
  (
    select
      sign_in_pin_salt is null
      and sign_in_pin_hash is null
      and sign_in_pin_updated_at is null
      and sign_out_pin_salt is null
      and sign_out_pin_hash is null
      and sign_out_pin_updated_at is null
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'clearing a legacy PIN clears both action-specific PIN sets'
);
select ok(
  (
    select not has_sign_in_pin and not has_sign_out_pin
    from public.phaseone_events
    where id = '70000000-0000-4000-8000-000000000002'
  ),
  'generated PIN indicators become false after a legacy PIN is cleared'
);

insert into public.phaseone_pin_attempts (event_id, client_key)
values (
  '70000000-0000-4000-8000-000000000002',
  repeat('a', 64)
);

select is(
  (
    select action_type
    from public.phaseone_pin_attempts
    where event_id = '70000000-0000-4000-8000-000000000002'
      and client_key = repeat('a', 64)
  ),
  'legacy',
  'deployed PIN attempt inserts default to the legacy action'
);

insert into public.phaseone_pin_attempts (event_id, client_key, action_type)
values (
  '70000000-0000-4000-8000-000000000002',
  repeat('b', 64),
  'sign_in'
);

select is(
  (
    select action_type
    from public.phaseone_pin_attempts
    where event_id = '70000000-0000-4000-8000-000000000002'
      and client_key = repeat('b', 64)
  ),
  'sign_in',
  'action-specific PIN attempts accept the sign-in action'
);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'public.phaseone_pin_attempts'::regclass
      and conname = 'phaseone_pin_attempts_action_type_check'
      and pg_get_constraintdef(oid) like '%legacy%'
      and pg_get_constraintdef(oid) like '%sign_in%'
      and pg_get_constraintdef(oid) like '%sign_out%'
  ),
  'PIN attempt actions are constrained to the supported flows'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.phaseone_pin_attempts'::regclass
  ),
  'PIN attempts remain protected by row-level security'
);

select * from finish();
rollback;


