alter table content.professional_events
  add column if not exists cta_url text;

alter table content.professional_events
  drop constraint if exists professional_events_cta_url_https;

alter table content.professional_events
  add constraint professional_events_cta_url_https
  check (
    cta_url is null
    or (
      char_length(cta_url) <= 2048
      and cta_url ~* '^https://[^[:space:]]+$'
    )
  );

comment on column content.professional_events.cta_url is
  'Optional HTTPS registration or information link used by the public Specialist event CTA.';
