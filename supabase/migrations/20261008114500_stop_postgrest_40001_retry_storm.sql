begin;

-- PostgREST 14 retries RPC transactions that raise SQLSTATE 40001.
-- In this application, these errors represent optimistic-concurrency/business
-- conflicts and must terminate the request instead of being retried.
--
-- Preserve each function body and error message, but rewrite the custom
-- serialization_failure code to P0001 so callers receive the conflict once.
do $$
declare
  r record;
  v_definition text;
begin
  for r in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and n.nspname in ('core', 'public', 'maklom_domain')
      and pg_get_functiondef(p.oid) like '%40001%'
  loop
    v_definition := replace(pg_get_functiondef(r.oid), '40001', 'P0001');
    execute v_definition;
  end loop;
end
$$;

-- Guardrail: fail the migration if any application function still exposes a
-- custom 40001 that can recreate the PostgREST retry storm.
do $$
begin
  if exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where p.prokind = 'f'
      and n.nspname in ('core', 'public', 'maklom_domain')
      and pg_get_functiondef(p.oid) like '%40001%'
  ) then
    raise exception 'Application function still raises SQLSTATE 40001';
  end if;
end
$$;

commit;
