begin;

select plan(10);

select has_column(
  'public',
  'phaseone_events',
  'opportunity_summary',
  'programme records carry public opportunity summaries'
);

select has_column(
  'public',
  'phaseone_events',
  'is_opportunity_published',
  'programme records carry opportunity publication state'
);

select has_column(
  'public',
  'phaseone_events',
  'registration_deadline',
  'programme records carry a registration deadline'
);

select col_default_is(
  'public',
  'phaseone_events',
  'is_opportunity_published',
  'false',
  'new programmes are not publicly listed by default'
);

select has_index(
  'public',
  'phaseone_events',
  'phaseone_events_public_opportunity_idx',
  'public opportunity listing has a partial index'
);

select ok(
  has_column_privilege('anon', 'public.phaseone_events', 'title', 'SELECT'),
  'anonymous users can read safe public programme fields'
);

select ok(
  not has_column_privilege('anon', 'public.phaseone_events', 'briefing_url', 'SELECT'),
  'anonymous users cannot read Event Guide briefing links directly'
);

select ok(
  has_column_privilege('anon', 'public.phaseone_event_timeslots', 'starts_at', 'SELECT'),
  'anonymous users can read published programme shift times'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'phaseone_events'
      and policyname = 'Public can read published KELUARGA programmes'
  ),
  'published programme rows have an explicit public RLS policy'
);

select is(
  (
    select count(*)::int
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'list_phaseone_opportunities'
      and p.pronargs = 0
  ),
  0,
  'legacy imported-opportunity RPC is retired'
);

select * from finish();
rollback;
