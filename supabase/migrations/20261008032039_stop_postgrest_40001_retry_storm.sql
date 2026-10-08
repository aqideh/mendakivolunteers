-- Stop PostgREST 14 from infinitely retrying application-level stale-state conflicts.
-- Supabase documents that SQLSTATE 40001 raised intentionally from RPC functions
-- is treated as a transient serialization failure by PostgREST 14.
--
-- This migration preserves the existing concurrency checks and messages while
-- changing only their SQLSTATE to the non-retryable PL/pgSQL default (P0001).

do $$
declare
  v_review_sql text;
  v_attendance_sql text;
begin
  select pg_get_functiondef(
    'public.review_volunteer_profile_change(uuid,text,text)'::regprocedure
  ) into v_review_sql;

  if position('40001' in v_review_sql) = 0 then
    raise exception 'Expected SQLSTATE 40001 was not found in review_volunteer_profile_change';
  end if;

  v_review_sql := replace(
    v_review_sql,
    'using errcode = ''40001''',
    'using errcode = ''P0001'''
  );
  v_review_sql := replace(
    v_review_sql,
    'using errcode=''40001''',
    'using errcode=''P0001'''
  );

  execute v_review_sql;

  select pg_get_functiondef(
    'maklom_domain.resolve_staged_identity_impl(text,bigint,uuid,boolean,text,text,text,uuid)'::regprocedure
  ) into v_attendance_sql;

  if position('40001' in v_attendance_sql) = 0 then
    raise exception 'Expected SQLSTATE 40001 was not found in resolve_staged_identity_impl';
  end if;

  v_attendance_sql := replace(
    v_attendance_sql,
    'using errcode = ''40001''',
    'using errcode = ''P0001'''
  );
  v_attendance_sql := replace(
    v_attendance_sql,
    'using errcode=''40001''',
    'using errcode=''P0001'''
  );

  execute v_attendance_sql;
end
$$;
