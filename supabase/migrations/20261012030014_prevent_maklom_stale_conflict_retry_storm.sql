-- Match production hotfix 20261012030014.
do $$
declare
  v_sql text;
  v_signature regprocedure := 'maklom_domain.resolve_staged_identity_impl(text,bigint,uuid,boolean,text,text,text,uuid)'::regprocedure;
begin
  v_sql := pg_get_functiondef(v_signature);
  if position('using errcode=''40001''' in v_sql) > 0 then
    v_sql := replace(v_sql, 'using errcode=''40001''', 'using errcode=''P0001''');
    execute v_sql;
  elsif position('using errcode=''P0001''' in v_sql) = 0 then
    raise exception 'Attendance resolver does not contain the expected conflict guard';
  end if;
  if exists (
    select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where p.prokind='f' and n.nspname in ('core','public','maklom_domain')
      and (p.prosrc like '%40001%' or p.prosrc ilike '%serialization_failure%')
  ) then
    raise exception 'Application function still declares a retryable business-conflict code';
  end if;
end $$;
