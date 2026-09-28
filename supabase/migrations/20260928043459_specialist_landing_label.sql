update content.landing_page_media
set label = 'Specialist', updated_at = now()
where page_key = 'specialist' and label is distinct from 'Specialist';
