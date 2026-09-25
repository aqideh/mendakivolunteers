begin;

select plan(8);

select has_extension(
  'postgis',
  'PostGIS is available for electoral geography resolution'
);

select has_table(
  'public',
  'electoral_divisions_2025',
  '2025 electoral division boundary table exists'
);

select is(
  (select count(*)::integer from public.electoral_divisions_2025),
  33,
  'all 33 GE2025 electoral divisions are loaded'
);

select ok(
  (select bool_and(extensions.ST_IsValid(geom)) from public.electoral_divisions_2025),
  'all stored electoral geometries are valid'
);

select is(
  (
    select electoral_division
    from public.lookup_electoral_division_2025(1.3521, 103.8198)
  ),
  'BISHAN-TOA PAYOH GRC',
  'a representative Singapore coordinate resolves to its GE2025 electoral division'
);

select is(
  (
    select boundary_version
    from public.lookup_electoral_division_2025(1.3521, 103.8198)
  ),
  'GE2025',
  'electoral lookup records the GE2025 boundary version'
);

select ok(
  not has_table_privilege(
    'authenticated',
    'public.electoral_divisions_2025',
    'SELECT'
  ),
  'volunteer browser clients cannot directly read electoral boundary geometry'
);

select has_column(
  'public',
  'volunteer_private_details',
  'electoral_division_code',
  'volunteer private details store the derived electoral division code'
);

select * from finish();
rollback;
