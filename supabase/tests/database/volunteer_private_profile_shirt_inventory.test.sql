begin;

select plan(24);

select has_table(
  'public',
  'volunteer_private_details',
  'private volunteer operational profile exists'
);

select has_column(
  'public',
  'volunteer_private_details',
  'date_of_birth',
  'private profile stores date of birth'
);

select has_column(
  'public',
  'volunteer_private_details',
  'electoral_division',
  'private profile can store verified electoral division'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'electoral_division',
    'UPDATE'
  ),
  'volunteers cannot directly update derived electoral division'
);

select ok(
  not has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'planning_area',
    'UPDATE'
  ),
  'volunteers cannot directly update derived planning area'
);

select ok(
  has_column_privilege(
    'authenticated',
    'public.volunteer_private_details',
    'postal_code',
    'UPDATE'
  ),
  'volunteers can update their postal code subject to RLS'
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
  'changing volunteer address clears derived geography through a trigger'
);

select has_table(
  'public',
  'volunteer_shirt_skus',
  'volunteer shirt SKU catalogue exists'
);

select is(
  (select count(*)::integer from public.volunteer_shirt_skus),
  16,
  'shirt catalogue contains two types across eight sizes'
);

select has_table(
  'public',
  'volunteer_shirt_issuances',
  'volunteer shirt issuance ledger exists'
);

select ok(
  not exists (
    select 1
    from pg_constraint con
    join pg_class c on c.oid = con.conrelid
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relname = 'volunteer_shirt_issuances'
      and con.contype = 'u'
      and pg_get_constraintdef(con.oid) = 'UNIQUE (volunteer_id)'
  ),
  'shirt issuance ledger allows authorised additional issues'
);

select has_table(
  'public',
  'volunteer_shirt_inventory_transactions',
  'shirt stock transaction ledger exists'
);

select has_view(
  'public',
  'volunteer_shirt_stock',
  'current volunteer shirt stock view exists'
);


select has_column(
  'public',
  'volunteer_shirt_issuances',
  'collection_method',
  'shirt issuance records whether stock was issued now or already collected'
);

select has_column(
  'public',
  'volunteer_shirt_issuances',
  'preferred_size_at_issue',
  'shirt issuance preserves the preferred size snapshot'
);

select has_column(
  'public',
  'volunteer_shirt_issuances',
  'issue_kind',
  'shirt issuance distinguishes initial and additional issues'
);

select has_column(
  'public',
  'volunteer_shirt_issuances',
  'issue_reason',
  'additional shirt issues record a reason'
);

select has_function(
  'public',
  'server_issue_additional_volunteer_shirt',
  array['uuid','uuid','text','text','text','uuid','text','text'],
  'service-boundary additional shirt issue RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.server_issue_additional_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)',
    'EXECUTE'
  ),
  'signed-in users cannot call additional shirt issuance directly'
);

select has_function(
  'public',
  'server_record_volunteer_shirt',
  array['uuid','uuid','text','text','text','uuid','text','text'],
  'service-boundary roster shirt recording RPC exists'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.server_record_volunteer_shirt(uuid,uuid,text,text,text,uuid,text,text)',
    'EXECUTE'
  ),
  'signed-in users cannot call privileged roster shirt recording directly'
);

select has_function(
  'public',
  'server_issue_volunteer_shirt',
  array['uuid','uuid','text','text','uuid','text'],
  'service-boundary shirt issuance RPC exists'
);

select has_function(
  'public',
  'server_record_volunteer_shirt_stock',
  array['uuid','text','text','integer','text','text'],
  'service-boundary shirt stock movement RPC exists'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.volunteer_shirt_inventory_transactions',
    'INSERT'
  ),
  'signed-in users cannot directly insert shirt stock transactions'
);

select * from finish();
rollback;
