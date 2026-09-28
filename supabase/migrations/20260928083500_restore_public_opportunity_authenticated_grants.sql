-- Restore the authenticated read grants required by the public Keluarga
-- Opportunities page. RLS continues to restrict reads to published events.
grant select (
  id,
  title,
  slug,
  venue,
  navigation_destination,
  opportunity_summary,
  opportunity_description,
  opportunity_image_url,
  opportunity_category,
  opportunity_eligibility,
  registration_deadline,
  is_opportunity_published,
  opportunity_sort_order
) on public.phaseone_events to authenticated;
