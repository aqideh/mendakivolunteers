-- Runs after every migration during GitHub database CI.
begin;
select plan(6);
select has_function(
  'maklom_domain','resolve_staged_identity_impl',
  array['text','bigint','uuid','boolean','text','text','text','uuid'],
  'staged identity implementation retains the original signature'
);
select has_function(
  'public','maklom_event_resolve_staged_identity',
  array['text','bigint','uuid','boolean','text','text','text'],
  'public resolver RPC retains original signature'
);
select ok(
  position('using errcode=''P0001''' in
    pg_get_functiondef('maklom_domain.resolve_staged_identity_impl(text,bigint,uuid,boolean,text,text,text,uuid)'::regprocedure)) > 0,
  'stale-version guard is non-retryable'
);
select ok(
  position('Staged attendance changed since it was opened' in
    pg_get_functiondef('maklom_domain.resolve_staged_identity_impl(text,bigint,uuid,boolean,text,text,text,uuid)'::regprocedure)) > 0,
  'stale-version protection remains intact'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.prokind='f' and n.nspname in ('core','public','maklom_domain')
   and p.prosrc like '%40001%'),
  0, 'no application function or trigger contains 40001'
);
select is(
  (select count(*)::integer from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where p.prokind='f' and n.nspname in ('core','public','maklom_domain')
   and p.prosrc ilike '%serialization_failure%'),
  0, 'no application function or trigger contains serialization_failure'
);
select * from finish();
rollback;
