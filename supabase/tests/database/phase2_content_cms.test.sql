begin;

select plan(25);

select has_schema('content', 'content schema exists');
select has_schema('app_private', 'private helper schema exists');
select has_table('content', 'opportunities', 'opportunities table exists');
select has_table('content', 'news_posts', 'news posts table exists');
select has_table('content', 'revisions', 'content revisions table exists');

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'content.opportunities'::regclass
  ),
  'opportunities has forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'content.news_posts'::regclass
  ),
  'news posts has forced row-level security'
);

select ok(
  (
    select relrowsecurity and relforcerowsecurity
    from pg_class
    where oid = 'content.revisions'::regclass
  ),
  'content revisions has forced row-level security'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'content'
      and tablename = 'opportunities'
  ),
  4,
  'opportunities has public read and manager write policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'content'
      and tablename = 'news_posts'
  ),
  4,
  'news posts has public read and manager write policies'
);

select is(
  (
    select count(*)::integer
    from pg_policies
    where schemaname = 'content'
      and tablename = 'revisions'
  ),
  1,
  'revisions has one manager read policy'
);

select ok(
  not has_table_privilege('anon', 'content.opportunities', 'SELECT'),
  'retired legacy opportunities are not browser-readable'
);

select ok(
  not has_table_privilege('anon', 'content.opportunities', 'INSERT'),
  'anonymous users cannot create opportunities'
);

select ok(
  not has_table_privilege('anon', 'content.news_posts', 'SELECT'),
  'retired legacy news posts are not browser-readable'
);

select ok(
  not has_table_privilege('authenticated', 'content.opportunities', 'INSERT'),
  'browser users cannot insert into retired legacy opportunities'
);

select ok(
  not has_table_privilege('authenticated', 'content.opportunities', 'UPDATE'),
  'browser users cannot update retired legacy opportunities'
);

select ok(
  not has_table_privilege('authenticated', 'content.opportunities', 'DELETE'),
  'browser users cannot delete opportunities'
);

select ok(
  not has_table_privilege('authenticated', 'content.revisions', 'SELECT'),
  'legacy content revisions are server-only'
);

select ok(
  not has_table_privilege('authenticated', 'content.revisions', 'INSERT'),
  'browser users cannot insert revision records directly'
);

select ok(
  has_function_privilege(
    'authenticated',
    'app_private.can_manage_content()',
    'EXECUTE'
  ),
  'authenticated users can execute the content authorization predicate'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'app_private.capture_content_revision()',
    'EXECUTE'
  ),
  'authenticated users cannot invoke the privileged revision trigger directly'
);

select has_trigger(
  'content',
  'opportunities',
  'opportunities_prepare_write',
  'opportunity writes are normalized before persistence'
);

select has_trigger(
  'content',
  'opportunities',
  'opportunities_capture_revision',
  'opportunity changes create immutable revisions'
);

select has_trigger(
  'content',
  'news_posts',
  'news_posts_prepare_write',
  'news writes are normalized before persistence'
);

select has_trigger(
  'content',
  'news_posts',
  'news_posts_capture_revision',
  'news changes create immutable revisions'
);

select * from finish();
rollback;
