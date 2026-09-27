begin;

create or replace view public.maklom_profile_inbox_review_queue
with (security_invoker = true)
as
select
  i.id,
  i.volunteer_id,
  v.id as maklom_volunteer_id,
  v.volunteer_code,
  v.name as volunteer_name,
  v.email as volunteer_email,
  v.phone as volunteer_phone,
  i.source_kind,
  i.source_record_id,
  i.event_id,
  e.title as event_title,
  e.reporting_at as event_reporting_at,
  e.venue as event_venue,
  i.source_person_key,
  i.title,
  i.payload,
  i.reviewed_title,
  i.reviewed_payload,
  i.status,
  i.reviewed_by,
  i.reviewed_at,
  i.review_note,
  i.created_at,
  i.updated_at
from public.maklom_profile_inbox i
left join public.maklom_volunteer_search_directory v
  on v.core_volunteer_id = i.volunteer_id
left join public.phaseone_events e
  on e.id = i.event_id;

revoke all on public.maklom_profile_inbox_review_queue from anon;
grant select on public.maklom_profile_inbox_review_queue to authenticated;

comment on view public.maklom_profile_inbox_review_queue is
  'MakLom review read model for contextual KELUARGA insights/reviews with volunteer and event context.';

commit;
