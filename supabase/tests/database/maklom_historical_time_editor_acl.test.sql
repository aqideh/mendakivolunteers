-- Guard the staff-only timing correction boundary and imported source provenance.
begin;
select plan(6);

select has_column('public','historical_attendance_import_rows','effective_timing_overridden',
  'timing editor tracks explicit effective corrections');

select is((select p.prosecdef from pg_proc p
  where p.oid='public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text)'::regprocedure),
  true, 'timing RPC runs behind staff-authorized definer boundary');

select is(has_function_privilege('authenticated',
  'public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text)',
  'EXECUTE'),true,'authenticated can invoke staff-guarded RPC');

select is(has_function_privilege('anon',
  'public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text)',
  'EXECUTE'),false,'anonymous requests cannot invoke timing RPC');

select is(has_function_privilege('authenticated',
  'maklom_domain.resolve_historical_attendance_times_impl(text,bigint,timestamptz,timestamptz,text,text,text,text,text,uuid)',
  'EXECUTE'),false,'internal resolver is not directly accessible');

select ok(position('source_sign_in_at = p_effective_sign_in' in
  pg_get_functiondef('maklom_domain.resolve_historical_attendance_times_impl(text,bigint,timestamptz,timestamptz,text,text,text,text,text,uuid)'::regprocedure))=0,
  'timing editor does not overwrite original imported sign-in');

select * from finish();
rollback;
