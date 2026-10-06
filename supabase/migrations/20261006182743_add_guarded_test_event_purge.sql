create or replace function core.purge_test_event(
  p_event_id uuid,
  p_expected_title text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_deleted_event_count integer := 0;
begin
  select title into v_title
  from public.phaseone_events
  where id = p_event_id
  for update;

  if v_title is null then
    raise exception 'Event not found';
  end if;

  if v_title <> p_expected_title then
    raise exception 'Event title mismatch';
  end if;

  if v_title !~* '(^|[^a-z])(test|dummy|demo|uat|sandbox)([^a-z]|$)' then
    raise exception 'Refusing to purge a non-test-labelled event: %', v_title;
  end if;

  delete from integration.ymhub_export_rows
  where source_attendance_id in (
    select id from public.phaseone_attendance where event_id = p_event_id
  );

  delete from public.keluarga_registration_shifts
  where timeslot_id in (
    select id from public.phaseone_event_timeslots where event_id = p_event_id
  );

  delete from public.keluarga_contribution_credits
  where event_id = p_event_id
     or attendance_session_id in (
       select id from public.phaseone_attendance_sessions where event_id = p_event_id
     );

  delete from public.volunteer_contributions
  where event_id = p_event_id
     or attendance_session_id in (
       select id from public.phaseone_attendance_sessions where event_id = p_event_id
     );

  delete from public.keluarga_registrations where event_id = p_event_id;
  delete from public.maklom_profile_inbox where event_id = p_event_id;

  execute 'alter table public.phaseone_attendance_audit disable trigger phaseone_attendance_audit_immutable';
  delete from public.phaseone_attendance_audit where event_id = p_event_id;
  execute 'alter table public.phaseone_attendance_audit enable trigger phaseone_attendance_audit_immutable';

  delete from public.phaseone_attendance_session_audit where event_id = p_event_id;
  delete from public.phaseone_attendance_sessions where event_id = p_event_id;
  delete from public.phaseone_attendance where event_id = p_event_id;

  delete from public.phaseone_events where id = p_event_id;
  get diagnostics v_deleted_event_count = row_count;

  if v_deleted_event_count <> 1 then
    raise exception 'Expected to delete exactly one event';
  end if;

  return jsonb_build_object(
    'event_id', p_event_id,
    'title', v_title,
    'deleted', true
  );
end;
$$;

revoke all on function core.purge_test_event(uuid, text) from public;
revoke all on function core.purge_test_event(uuid, text) from anon;
revoke all on function core.purge_test_event(uuid, text) from authenticated;
grant execute on function core.purge_test_event(uuid, text) to service_role;
