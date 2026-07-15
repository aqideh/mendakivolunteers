begin;

select plan(2);

select ok(
  position(
    'old.status = any(privileged_statuses)'
    in pg_get_functiondef(
      'app_private.enforce_content_status_transition()'::regprocedure
    )
  ) > 0,
  'transition guard checks the existing content status'
);

insert into auth.users (id, email)
values (
  '40000000-0000-4000-8000-000000000001',
  'phase2-editor@example.test'
);

update core.user_accounts
set status = 'active'
where id = '40000000-0000-4000-8000-000000000001';

insert into core.user_roles (user_id, role, reason)
values (
  '40000000-0000-4000-8000-000000000001',
  'content_editor',
  'Phase 2 database test'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000001',
  true
);
select set_config(
  'request.jwt.claims',
  '{"sub":"40000000-0000-4000-8000-000000000001","role":"authenticated"}',
  true
);
set local role authenticated;

select throws_ok(
  $$
    update content.news_posts
    set title = 'Editor attempted to change live content'
    where slug = 'welcome-to-the-volunteer-portal'
  $$,
  '42501',
  'Publisher permission is required to edit privileged content',
  'content editors cannot modify already-published records'
);

select * from finish();
rollback;
