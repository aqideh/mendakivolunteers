begin;

-- The YM Hub importer runs only through the server-side service role. Grant the
-- smallest operational-table privileges it needs to reconcile imported source
-- records into existing KELUARGA event timeslots and roster rows.
grant select (id, ymhub_activity_id)
  on public.phaseone_events
  to service_role;

grant select (
  timeslot_id,
  ymhub_assignment_id,
  volunteer_id,
  volunteer_key,
  email_normalized,
  source_assignment_status
)
  on public.phaseone_roster
  to service_role;

grant update (
  volunteer_id,
  ymhub_assignment_id,
  source_assignment_status
)
  on public.phaseone_roster
  to service_role;

commit;
