begin;

select plan(2);

select ok(
  exists (
    select 1
    from pg_constraint
    where conrelid = 'content.opportunities'::regclass
      and conname = 'opportunities_physical_location_required'
      and convalidated
  ),
  'physical opportunity location constraint exists and is validated'
);

select throws_ok(
  $$
    insert into content.opportunities (
      slug,
      title,
      summary,
      body,
      category,
      location_name,
      is_remote,
      starts_at,
      registration_url
    )
    values (
      'missing-location-phase-0',
      'Missing location test',
      'This record deliberately omits its physical location.',
      'This record verifies that the database rejects an in-person opportunity without a location.',
      'Testing',
      null,
      false,
      '2027-01-01T00:00:00Z',
      'https://example.invalid/register'
    )
  $$,
  '23514',
  'new row for relation "opportunities" violates check constraint "opportunities_physical_location_required"',
  'in-person opportunities cannot be saved without a location'
);

select * from finish();
rollback;
