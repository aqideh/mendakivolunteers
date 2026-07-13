begin;

select plan(6);

select ok(
  to_regprocedure('app_private.enforce_content_status_transition()') is not null,
  'content status transition guard exists'
);

select has_trigger(
  'content',
  'opportunities',
  'opportunities_enforce_status_transition',
  'opportunity status transitions are guarded'
);

select has_trigger(
  'content',
  'news_posts',
  'news_posts_enforce_status_transition',
  'news status transitions are guarded'
);

select ok(
  (
    select prosecdef
    from pg_proc
    where oid = 'app_private.enforce_content_status_transition()'::regprocedure
  ),
  'status transition guard runs with its controlled function privileges'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.enforce_content_status_transition()',
    'EXECUTE'
  ),
  'authenticated clients cannot call the transition guard directly'
);

select ok(
  has_function_privilege(
    'service_role',
    'app_private.enforce_content_status_transition()',
    'EXECUTE'
  ),
  'service role can execute the transition guard for trusted operations'
);

select * from finish();
rollback;
