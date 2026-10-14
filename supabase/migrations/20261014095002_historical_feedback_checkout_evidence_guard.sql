begin;
-- Preserve captured feedback-submission checkout provenance in timing-editor validation.
do $guard$
begin
 if to_regprocedure(
 'public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text)'
 ) is null then
   raise exception 'Expected MakLom timing RPC signature not found';
 end if;
end $guard$;

create or replace function public.maklom_resolve_historical_attendance_times(
 p_row_id text, p_expected_version bigint,
 p_effective_sign_in timestamptz, p_effective_sign_out timestamptz,
 p_sign_in_evidence_type text, p_sign_out_evidence_type text,
 p_reason_code text, p_reason_note text default null, p_batch_id text default null
) returns public.historical_attendance_import_rows
language plpgsql security definer set search_path=''
as $function$
declare
 v_actor uuid := auth.uid();
 v_row public.historical_attendance_import_rows%rowtype;
begin
 if v_actor is null or not public.maklom_can('ops.write') then
   raise exception 'MakLom operations write access is required' using errcode='42501';
 end if;
 select * into v_row from public.historical_attendance_import_rows
 where id=p_row_id for update;
 if not found then raise exception 'Staged attendance row not found' using errcode='P0002'; end if;
 if v_row.row_version is distinct from p_expected_version then
   raise exception 'Staged attendance changed; refresh before saving' using errcode='P1201';
 end if;
 if v_row.decision is distinct from 'pending'
    or v_row.committed_keluarga_session_id is not null
    or v_row.committed_attendance_id is not null then
   raise exception 'Attendance already reviewed; use Correct attendance' using errcode='P1202';
 end if;
 if p_batch_id is not null and p_batch_id is distinct from v_row.batch_id then
   raise exception 'Attendance batch mismatch' using errcode='22023';
 end if;
 if p_sign_in_evidence_type='SOURCE_CAPTURED' and
    (v_row.source_sign_in_original_at is null or
      date_trunc('milliseconds',p_effective_sign_in)
      is distinct from date_trunc('milliseconds',v_row.source_sign_in_original_at)) then
   raise exception 'No matching captured sign-in evidence' using errcode='P1203';
 end if;
 -- For historical FormSG feedback-as-checkout, a safely matched feedback timestamp
 -- is captured source evidence even when no separate checkout row was imported.
 if p_sign_out_evidence_type='SOURCE_CAPTURED' and
    (
      coalesce(
        v_row.source_check_out_original_at,
        case
          when not (v_row.review_flags && array['feedback_event_mismatch','feedback_ambiguous']::text[])
          then v_row.source_feedback_at
          else null
        end
      ) is null
      or date_trunc('milliseconds',p_effective_sign_out)
      is distinct from date_trunc('milliseconds',coalesce(
        v_row.source_check_out_original_at,
        case
          when not (v_row.review_flags && array['feedback_event_mismatch','feedback_ambiguous']::text[])
          then v_row.source_feedback_at
          else null
        end
      ))
    ) then
   raise exception 'No matching captured sign-out evidence' using errcode='P1203';
 end if;
 return maklom_domain.resolve_historical_attendance_times_impl(
  p_row_id,p_expected_version,p_effective_sign_in,p_effective_sign_out,
  p_sign_in_evidence_type,p_sign_out_evidence_type,p_reason_code,p_reason_note,
  p_batch_id,v_actor
 );
end;
$function$;
revoke all on function public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text) from public,anon,service_role;
grant execute on function public.maklom_resolve_historical_attendance_times(text,bigint,timestamptz,timestamptz,text,text,text,text,text) to authenticated;
revoke all on function maklom_domain.resolve_historical_attendance_times_impl(text,bigint,timestamptz,timestamptz,text,text,text,text,text,uuid) from public,anon,authenticated;
commit;