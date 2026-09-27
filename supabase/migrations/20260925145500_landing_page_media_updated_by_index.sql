begin;

create index if not exists landing_page_media_updated_by_idx
  on content.landing_page_media (updated_by)
  where updated_by is not null;

commit;
