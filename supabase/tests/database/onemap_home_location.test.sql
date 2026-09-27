begin;

select plan(7);

select has_function(
  'public',
  'update_current_volunteer_home_location',
  array['text','text','numeric','numeric','text'],
  'verified volunteer home location RPC exists'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.update_current_volunteer_home_location(text,text,numeric,numeric,text)',
    'EXECUTE'
  ),
  'authenticated volunteers can execute verified location RPC'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'latitude',
    'UPDATE'
  ),
  'volunteers cannot directly update verified latitude'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'longitude',
    'UPDATE'
  ),
  'volunteers cannot directly update verified longitude'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'electoral_division',
    'UPDATE'
  ),
  'volunteers cannot directly update electoral division'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'volunteer_private_details'
      and t.tgname = 'volunteer_private_details_apply_electoral_2025'
      and not t.tgisinternal
  ),
  'verified coordinates trigger GE2025 electoral lookup'
);

select ok(
  exists (
    select 1
    from pg_trigger t
    join pg_class c on c.oid = t.tgrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'volunteer_private_details'
      and t.tgname = 'volunteer_private_details_clear_location'
      and not t.tgisinternal
  ),
  'unverified address edits clear derived location'
);

select * from finish();
rollback;
