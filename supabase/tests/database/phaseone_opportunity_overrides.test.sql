begin;

select plan(10);

select has_table(
  'public',
  'phaseone_opportunity_overrides',
  'manual opportunity override table exists'
);

select ok(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.phaseone_opportunity_overrides'::regclass
  ),
  'manual opportunity overrides have RLS enabled'
);

select ok(
  not has_table_privilege('anon', 'public.phaseone_opportunity_overrides', 'SELECT'),
  'anonymous clients cannot read override rows directly'
);

select ok(
  not has_table_privilege('authenticated', 'public.phaseone_opportunity_overrides', 'SELECT'),
  'authenticated clients cannot read override rows directly'
);

select ok(
  has_function_privilege('anon', 'public.list_phaseone_opportunities()', 'EXECUTE'),
  'anonymous clients can load the public effective opportunity projection'
);

select ok(
  has_function_privilege('authenticated', 'public.list_phaseone_opportunities()', 'EXECUTE'),
  'authenticated clients can load the public effective opportunity projection'
);

insert into public.phaseone_external_opportunities (
  id,
  source_key,
  title,
  summary,
  image_url,
  starts_at,
  ends_at,
  venue,
  source_url,
  is_active
)
values
(
  '91000000-0000-4000-8000-000000000001',
  'override-test-one',
  'Imported title one',
  'Imported summary one',
  'https://example.test/imported-one.jpg',
  '2026-10-01 01:00:00+00',
  '2026-10-01 03:00:00+00',
  'Imported venue one',
  'https://www.volunteer.gov.sg/opportunity/a',
  true
),
(
  '91000000-0000-4000-8000-000000000002',
  'override-test-two',
  'Imported title two',
  'Imported summary two',
  null,
  '2026-10-02 01:00:00+00',
  '2026-10-02 03:00:00+00',
  'Imported venue two',
  'https://www.volunteer.gov.sg/opportunity/b',
  true
);

select is(
  (
    select title
    from public.list_phaseone_opportunities()
    where id = '91000000-0000-4000-8000-000000000001'
  ),
  'Imported title one',
  'source data is returned before an override exists'
);

insert into public.phaseone_opportunity_overrides (
  opportunity_id,
  title,
  summary,
  image_url,
  starts_at,
  ends_at,
  schedule_text,
  venue,
  sort_order
)
values (
  '91000000-0000-4000-8000-000000000001',
  'Manual title',
  'Manual summary',
  null,
  '2026-11-01 01:00:00+00',
  '2026-11-01 04:00:00+00',
  '9:00 AM - 12:00 PM',
  'Manual venue',
  1
);

select ok(
  (
    select
      title = 'Manual title'
      and summary = 'Manual summary'
      and image_url is null
      and venue = 'Manual venue'
      and has_manual_override
    from public.list_phaseone_opportunities()
    where id = '91000000-0000-4000-8000-000000000001'
  ),
  'manual presentation fields replace imported values'
);

select is(
  (
    select (array_agg(id))[1]
    from public.list_phaseone_opportunities()
    where id in (
      '91000000-0000-4000-8000-000000000001',
      '91000000-0000-4000-8000-000000000002'
    )
  ),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'manual sort order places an overridden card first'
);

update public.phaseone_opportunity_overrides
set is_hidden = true
where opportunity_id = '91000000-0000-4000-8000-000000000001';

select is(
  (
    select count(*)::integer
    from public.list_phaseone_opportunities()
    where id = '91000000-0000-4000-8000-000000000001'
  ),
  0,
  'hidden overrides remove the card from the public projection'
);

select * from finish();
rollback;
