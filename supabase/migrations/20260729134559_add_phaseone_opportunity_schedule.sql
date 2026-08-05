alter table public.phaseone_external_opportunities
  add column schedule_text text;

alter table public.phaseone_external_opportunities
  add constraint phaseone_external_opportunities_schedule_text_length
  check (schedule_text is null or char_length(schedule_text) <= 100);

comment on column public.phaseone_external_opportunities.schedule_text is
  'Human-readable schedule from Volunteer.gov.sg; placeholder midnight ranges are stored as multiple timings.';
