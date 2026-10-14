-- Compatible hotfix: retain the requested checkout when only check-in changes.
-- No historical records are repaired or approved by this migration.
create or replace function maklom_domain.correct_direct_roster_attendance_impl(
  p_roster_id uuid,p_expected_updated_at timestamptz,
  p_signed_in_at timestamptz,p_signed_out_at timestamptz,
  p_reason_note text,p_actor uuid
) returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_att public.phaseone_attendance%rowtype;
  v_current public.phaseone_attendance%rowtype;
  v_roster public.phaseone_roster%rowtype;
  v_note text := btrim(coalesce(p_reason_note,''));
begin
  perform maklom_domain.require_editor(p_actor);
  if p_expected_updated_at is null or p_signed_in_at is null
    or not isfinite(p_signed_in_at)
    or (p_signed_out_at is not null and (not isfinite(p_signed_out_at) or p_signed_out_at<p_signed_in_at)) then
    raise exception 'Valid sign-in, sign-out and current record version are required' using errcode='22023';
  end if;
  if char_length(v_note) not between 5 and 500 then
    raise exception 'A correction reason between 5 and 500 characters is required' using errcode='22023';
  end if;
  select * into v_roster from public.phaseone_roster where id=p_roster_id for update;
  if not found then raise exception 'Roster row not found' using errcode='P0002'; end if;
  if exists(select 1 from public.phaseone_attendance_session_shifts where roster_id=p_roster_id) then
    raise exception 'This record has a linked session; correct the session instead' using errcode='P1203';
  end if;
  select * into v_att from public.phaseone_attendance where roster_id=p_roster_id for update;
  if not found then raise exception 'Attendance row not found' using errcode='P0002'; end if;
  if v_att.updated_at is distinct from p_expected_updated_at then
    raise exception 'Attendance changed. Refresh before correcting it' using errcode='P1202';
  end if;
  if v_att.non_attendance_status is not null then
    perform public.phaseone_apply_attendance_change(
      v_roster.event_id,p_roster_id,'clear_non_attendance',null,v_note,p_actor);
  end if;
  if v_att.signed_out_at is not null
    and (v_att.signed_in_at is distinct from p_signed_in_at
      or v_att.signed_out_at is distinct from p_signed_out_at) then
    perform public.phaseone_apply_attendance_change(
      v_roster.event_id,p_roster_id,'clear_sign_out',null,v_note,p_actor);
  end if;
  if v_att.signed_in_at is distinct from p_signed_in_at then
    perform public.phaseone_apply_attendance_change(
      v_roster.event_id,p_roster_id,'mark_sign_in',p_signed_in_at,v_note,p_actor);
  end if;
  -- Compare against the state AFTER clearing checkout, not the original row.
  select * into v_current from public.phaseone_attendance where roster_id=p_roster_id;
  if p_signed_out_at is not null and v_current.signed_out_at is distinct from p_signed_out_at then
    perform public.phaseone_apply_attendance_change(
      v_roster.event_id,p_roster_id,'mark_sign_out',p_signed_out_at,v_note,p_actor);
  end if;
  select * into v_current from public.phaseone_attendance where roster_id=p_roster_id;
  if v_current.signed_in_at is distinct from p_signed_in_at
    or v_current.signed_out_at is distinct from p_signed_out_at
    or v_current.non_attendance_status is not null then
    raise exception 'Attendance correction did not produce the requested interval; no changes were saved' using errcode='P1204';
  end if;
  return jsonb_build_object('roster_id',p_roster_id,'signed_in_at',v_current.signed_in_at,
    'signed_out_at',v_current.signed_out_at,'updated_at',v_current.updated_at);
end; $$;
revoke all on function maklom_domain.correct_direct_roster_attendance_impl(uuid,timestamptz,timestamptz,timestamptz,text,uuid) from public,anon;
grant execute on function maklom_domain.correct_direct_roster_attendance_impl(uuid,timestamptz,timestamptz,timestamptz,text,uuid) to authenticated;

-- Stale form versions are business conflicts, not retryable serialization failures.
-- Preserve the deployed schedule implementation apart from the error code.
do $$
declare v_oid regprocedure; v_sql text;
begin
  v_oid:=to_regprocedure('maklom_domain.save_event_schedule_impl(uuid,timestamptz,jsonb,text,uuid)');
  if v_oid is null then raise exception 'Install canonical schedule support before this migration'; end if;
  v_sql:=pg_get_functiondef(v_oid);
  if position('40001' in v_sql)>0 then
    execute replace(v_sql,'''40001''','''P1202''');
  end if;
end $$;
