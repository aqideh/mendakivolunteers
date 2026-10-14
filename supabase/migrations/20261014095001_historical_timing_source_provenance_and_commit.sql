BEGIN;
-- Only timing-editor corrections override imported attendance evidence.
-- Source and source-original timestamps stay untouched by the editor.
ALTER TABLE public.historical_attendance_import_rows
  ADD COLUMN IF NOT EXISTS effective_timing_overridden boolean NOT NULL DEFAULT false;

-- Replace maklom_domain.resolve_historical_attendance_times_impl, retaining its existing signature, grant and security mode.
CREATE OR REPLACE FUNCTION maklom_domain.resolve_historical_attendance_times_impl(p_row_id text, p_expected_version bigint, p_effective_sign_in timestamp with time zone, p_effective_sign_out timestamp with time zone, p_sign_in_evidence_type text, p_sign_out_evidence_type text, p_reason_code text, p_reason_note text, p_batch_id text, p_actor uuid)
 RETURNS historical_attendance_import_rows
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.historical_attendance_import_rows%rowtype;
  v_updated public.historical_attendance_import_rows%rowtype;
  v_previous jsonb;
  v_new jsonb;
  v_reason_code text := btrim(coalesce(p_reason_code,''));
  v_reason_note text := nullif(btrim(coalesce(p_reason_note,'')),'');
begin
  perform maklom_domain.require_editor(p_actor);

  if char_length(v_reason_code) < 1 or char_length(v_reason_code) > 80 then
    raise exception 'An adjustment reason is required' using errcode='22023';
  end if;
  if v_reason_note is not null and char_length(v_reason_note) > 500 then
    raise exception 'Adjustment note must be 500 characters or fewer' using errcode='22023';
  end if;
  if p_effective_sign_in is null then
    raise exception 'Effective sign-in time is required' using errcode='22023';
  end if;
  if p_effective_sign_out is not null and p_effective_sign_out < p_effective_sign_in then
    raise exception 'Effective sign-out cannot be before effective sign-in' using errcode='22023';
  end if;
  if p_sign_in_evidence_type is not null and p_sign_in_evidence_type not in (
    'SOURCE_CAPTURED','STAFF_CONFIRMED','ADMIN_CORRECTED','SHIFT_START_ESTIMATE','IMPORTED_RECORD'
  ) then
    raise exception 'Invalid sign-in evidence type' using errcode='22023';
  end if;
  if p_sign_out_evidence_type is not null and p_sign_out_evidence_type not in (
    'SOURCE_CAPTURED','STAFF_CONFIRMED','ADMIN_CORRECTED','SHIFT_END_ESTIMATE','IMPORTED_RECORD'
  ) then
    raise exception 'Invalid sign-out evidence type' using errcode='22023';
  end if;

  select * into v_row
  from public.historical_attendance_import_rows
  where id = p_row_id
  for update;

  if not found then
    raise exception 'Staged attendance row not found' using errcode='P0002';
  end if;
  if v_row.row_version <> p_expected_version then
    raise exception 'Staged attendance changed since it was opened. Refresh before reviewing it.'
      using errcode='P0001';
  end if;

  v_previous := jsonb_build_object(
    'source_sign_in_original_at', coalesce(v_row.source_sign_in_original_at, v_row.source_sign_in_at),
    'source_check_out_original_at', coalesce(v_row.source_check_out_original_at, v_row.source_check_out_at),
    'effective_sign_in_at', coalesce(v_row.effective_sign_in_at, v_row.source_sign_in_at),
    'effective_sign_out_at', coalesce(v_row.effective_sign_out_at, v_row.source_check_out_at),
    'sign_in_evidence_type', v_row.sign_in_evidence_type,
    'sign_out_evidence_type', v_row.sign_out_evidence_type
  );

  update public.historical_attendance_import_rows
  set
    effective_timing_overridden = true,
    effective_sign_in_at = p_effective_sign_in,
    effective_sign_out_at = p_effective_sign_out,
    sign_in_evidence_type = coalesce(p_sign_in_evidence_type, sign_in_evidence_type, 'SOURCE_CAPTURED'),
    sign_out_evidence_type = case
      when p_effective_sign_out is null then null
      else coalesce(p_sign_out_evidence_type, sign_out_evidence_type, 'ADMIN_CORRECTED')
    end,
    decision = 'pending',
    decision_note = coalesce(v_reason_note, decision_note)
  where id = p_row_id
  returning * into v_updated;

  v_new := jsonb_build_object(
    'source_sign_in_original_at', v_updated.source_sign_in_original_at,
    'source_check_out_original_at', v_updated.source_check_out_original_at,
    'effective_sign_in_at', v_updated.effective_sign_in_at,
    'effective_sign_out_at', v_updated.effective_sign_out_at,
    'sign_in_evidence_type', v_updated.sign_in_evidence_type,
    'sign_out_evidence_type', v_updated.sign_out_evidence_type
  );

  insert into public.historical_attendance_adjustment_audit(
    attendance_row_id,batch_id,previous_state,new_state,adjustment_reason_code,
    adjustment_reason_note,adjusted_by_user_id
  ) values (
    p_row_id,p_batch_id,v_previous,v_new,v_reason_code,v_reason_note,p_actor
  );

  perform audit.write_event(
    'maklom.historical_attendance_effective_time_adjusted',
    'historical_attendance',
    p_row_id,
    jsonb_build_object(
      'batch_id',p_batch_id,
      'reason_code',v_reason_code,
      'reason_note',v_reason_note,
      'previous_state',v_previous,
      'new_state',v_new
    ),
    p_actor,
    null
  );

  return v_updated;
end;
$function$;

-- Replace maklom_domain.review_legacy_staged_attendance_impl, retaining its existing signature, grant and security mode.
CREATE OR REPLACE FUNCTION maklom_domain.review_legacy_staged_attendance_impl(p_row_id text, p_expected_version bigint, p_decision text, p_shift_id text, p_reason_note text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.historical_attendance_import_rows%rowtype;
  v_event public.events%rowtype;
  v_shift public.event_shifts%rowtype;
  v_profile public.volunteers%rowtype;
  v_existing_id text;
  v_attendance_id text;
  v_checkout_at timestamptz;
  v_duration integer := 0;
  v_pending integer := 0;
  v_total integer := 0;
  v_note text := btrim(coalesce(p_reason_note,''));
  v_decision text := lower(btrim(coalesce(p_decision,'')));
begin
  perform maklom_domain.require_editor(p_actor);

  if v_decision not in ('accept','reject') then
    raise exception 'Decision must be accept or reject' using errcode='22023';
  end if;
  if char_length(v_note)>500 then
    raise exception 'Review note must be 500 characters or fewer' using errcode='22023';
  end if;

  select * into v_row
  from public.historical_attendance_import_rows
  where id=p_row_id
  for update;

  if not found then
    raise exception 'Staged attendance row not found' using errcode='P0002';
  end if;
  if v_row.row_version<>p_expected_version then
    raise exception 'Staged attendance changed since it was opened. Refresh before reviewing it.'
      using errcode='P0001';
  end if;

  if v_decision='reject' then
    update public.historical_attendance_import_rows
    set
      decision='rejected',
      decision_note=coalesce(nullif(v_note,''),'Rejected from event data review'),
      reviewed_at=now(),
      reviewed_by=p_actor
    where id=p_row_id;

    perform audit.write_event(
      'maklom.historical_attendance_rejected',
      'historical_attendance',
      p_row_id,
      jsonb_build_object(
        'legacy_event_id',v_row.matched_event_id,
        'source_row_number',v_row.source_row_number,
        'review_note',v_note
      ),
      p_actor,
      null
    );
  else
    if v_row.matched_event_id is null then
      raise exception 'Resolve the event before accepting this attendance row' using errcode='P0001';
    end if;

    select * into v_event
    from public.events
    where id=v_row.matched_event_id;

    if not found then
      raise exception 'Matched MakLom event not found' using errcode='P0002';
    end if;

    if v_row.matched_volunteer_id is null or v_row.matched_core_volunteer_id is null then
      raise exception 'Resolve the volunteer before accepting this attendance row' using errcode='P0001';
    end if;

    select * into v_profile
    from public.volunteers
    where id=v_row.matched_volunteer_id
      and core_volunteer_id=v_row.matched_core_volunteer_id;

    if not found then
      raise exception 'The staged volunteer match no longer points to the canonical volunteer' using errcode='P0001';
    end if;

    if nullif(btrim(coalesce(p_shift_id,'')),'') is not null then
      select * into v_shift
      from public.event_shifts
      where id=p_shift_id
        and event_id=v_event.id
        and shift_date=v_row.event_date;
      if not found then
        raise exception 'The selected shift does not belong to this event and attendance date' using errcode='P0001';
      end if;
    elsif v_row.matched_shift_id is not null then
      select * into v_shift
      from public.event_shifts
      where id=v_row.matched_shift_id
        and event_id=v_event.id
        and shift_date=v_row.event_date;
      if not found then
        raise exception 'The previously matched shift is no longer valid' using errcode='P0001';
      end if;
    else
      select * into v_shift
      from public.event_shifts
      where event_id=v_event.id
        and shift_date=v_row.event_date
      order by start_time nulls last,id
      limit 1;

      if not found then
        raise exception 'This event has no shift for the attendance date' using errcode='P0001';
      end if;

      if (
        select count(*)
        from public.event_shifts
        where event_id=v_event.id
          and shift_date=v_row.event_date
      )>1 then
        raise exception 'Choose the correct event shift before accepting attendance' using errcode='P0001';
      end if;
    end if;

    if (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) is null then
      raise exception 'This staged row has no usable sign-in timestamp' using errcode='P0001';
    end if;

    v_checkout_at:=(case when v_row.effective_timing_overridden then v_row.effective_sign_out_at else coalesce(v_row.source_check_out_at, case when not (v_row.review_flags && array['feedback_event_mismatch','feedback_ambiguous']::text[]) then v_row.source_feedback_at else null end) end);
    if v_checkout_at is not null and v_checkout_at<(case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) then
      raise exception 'Source check-out cannot be before source sign-in' using errcode='P0001';
    end if;

    if v_checkout_at is not null then
      v_duration:=greatest(
        floor(extract(epoch from (v_checkout_at-(case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end)))/60)::integer,
        0
      );
    else
      v_duration:=greatest(coalesce(v_row.reported_minutes,0),0);
    end if;

    if v_duration>6059 then
      raise exception 'Calculated attendance duration exceeds the supported limit' using errcode='22023';
    end if;

    select a.id into v_existing_id
    from public.attendance_log a
    where a.historical_source_row_hash=v_row.source_row_hash
       or (
         a.volunteer_id=v_row.matched_volunteer_id
         and a.event_id=v_event.id
         and a.shift_id=v_shift.id
         and a.event_date=v_row.event_date
         and a.attended=v_row.attended
       )
    order by case when a.historical_source_row_hash=v_row.source_row_hash then 0 else 1 end,a.created_at
    limit 1;

    if v_existing_id is not null then
      update public.historical_attendance_import_rows
      set
        matched_shift_id=v_shift.id,
        match_status='duplicate',
        duplicate_of_attendance_id=v_existing_id,
        committed_attendance_id=v_existing_id,
        match_reason='Attendance already exists for this volunteer and event shift',
        review_flags=array_remove(review_flags,'shift_ambiguous'),
        source_check_out_at=coalesce(source_check_out_at,v_checkout_at),
        source_check_out_kind=case
          when source_check_out_at is not null then source_check_out_kind
          when source_feedback_at is not null then 'feedback_submission'
          else source_check_out_kind
        end,
        reported_minutes=v_duration,
        decision='approved',
        decision_note=coalesce(nullif(v_note,''),'Confirmed against existing MakLom attendance'),
        reviewed_at=now(),
        reviewed_by=p_actor
      where id=p_row_id;
    else
      v_attendance_id:='hist_att_'||substr(md5(v_row.id||'|'||v_row.source_row_hash),1,24);

      insert into public.attendance_log(
        id,volunteer_id,name,email,contact,attended,event_name,event_date,
        duration_minutes,sign_in_at,sign_out_at,calculated_duration_minutes,
        staff_credited_duration_minutes,staff_credit_note,event_id,shift_id,shift_label,
        source_kind,historical_import_batch_id,historical_source_row_hash,volunteer_role,
        created_by,updated_by
      ) values (
        v_attendance_id,v_row.matched_volunteer_id,v_row.full_name,v_row.email,v_row.phone,
        v_row.attended,v_event.name,v_row.event_date,
        case when v_row.attended then v_duration else 0 end,
        (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end),v_checkout_at,
        case when v_checkout_at is not null then v_duration else null end,
        null,
        case
          when v_checkout_at is not null then 'Historical import: source interval confirmed in event review'
          when v_duration>0 then 'Historical import: reviewed duration'
          else null
        end,
        v_event.id,v_shift.id,v_shift.name,'historical_import',v_row.batch_id,
        v_row.source_row_hash,v_row.volunteer_role,p_actor,p_actor
      );

      update public.historical_attendance_import_rows
      set
        matched_shift_id=v_shift.id,
        match_status='matched',
        match_reason=case
          when v_checkout_at is not null then 'Confirmed event shift with source sign-in and check-out'
          else 'Confirmed event shift with source sign-in'
        end,
        review_flags=array_remove(review_flags,'shift_ambiguous'),
        source_check_out_at=coalesce(source_check_out_at,v_checkout_at),
        source_check_out_kind=case
          when source_check_out_at is not null then source_check_out_kind
          when source_feedback_at is not null then 'feedback_submission'
          else source_check_out_kind
        end,
        reported_minutes=v_duration,
        committed_attendance_id=v_attendance_id,
        duplicate_of_attendance_id=null,
        decision='approved',
        decision_note=coalesce(nullif(v_note,''),'Confirmed in MakLom event data review'),
        reviewed_at=now(),
        reviewed_by=p_actor
      where id=p_row_id;
    end if;

    perform audit.write_event(
      case when v_existing_id is not null
        then 'maklom.historical_attendance_linked_existing'
        else 'maklom.historical_attendance_accepted'
      end,
      'historical_attendance',
      p_row_id,
      jsonb_build_object(
        'legacy_event_id',v_event.id,
        'shift_id',v_shift.id,
        'volunteer_id',v_row.matched_core_volunteer_id,
        'attendance_id',coalesce(v_existing_id,v_attendance_id),
        'source_row_number',v_row.source_row_number,
        'source_sign_in_at',(case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end),
        'source_check_out_at',v_checkout_at,
        'credited_minutes',v_duration,
        'existing_attendance',v_existing_id is not null,
        'review_note',v_note
      ),
      p_actor,
      null
    );
  end if;

  select count(*)::integer,count(*) filter(where decision='pending')::integer
  into v_total,v_pending
  from public.historical_attendance_import_rows
  where batch_id=v_row.batch_id;

  update public.historical_attendance_import_batches b
  set
    row_count=v_total,
    matched_count=(
      select count(*)::integer from public.historical_attendance_import_rows r
      where r.batch_id=v_row.batch_id and r.matched_volunteer_id is not null
    ),
    review_count=(
      select count(*)::integer from public.historical_attendance_import_rows r
      where r.batch_id=v_row.batch_id and r.decision='pending'
    ),
    duplicate_count=(
      select count(*)::integer from public.historical_attendance_import_rows r
      where r.batch_id=v_row.batch_id and r.match_status='duplicate'
    ),
    imported_count=(
      select count(*)::integer from public.historical_attendance_import_rows r
      where r.batch_id=v_row.batch_id
        and r.committed_attendance_id is not null
        and r.match_status<>'duplicate'
    ),
    total_minutes=(
      select coalesce(sum(case
        when r.committed_attendance_id is not null
          and r.match_status<>'duplicate'
          and r.attended
        then r.reported_minutes else 0 end),0)::integer
      from public.historical_attendance_import_rows r
      where r.batch_id=v_row.batch_id
    ),
    status=case when v_pending>0 then 'partial' else 'committed' end,
    completed_at=case when v_pending>0 then null else now() end
  where b.id=v_row.batch_id;

  return jsonb_build_object(
    'row_id',p_row_id,
    'decision',case when v_decision='reject' then 'rejected' else 'approved' end,
    'attendance_id',coalesce(v_existing_id,v_attendance_id),
    'event_id',v_row.matched_event_id,
    'shift_id',case when v_decision='accept' then v_shift.id else null end,
    'pending_in_batch',v_pending
  );
end;
$function$;

-- Replace maklom_domain.review_staged_attendance_impl, retaining its existing signature, grant and security mode.
CREATE OR REPLACE FUNCTION maklom_domain.review_staged_attendance_impl(p_row_id text, p_expected_version bigint, p_decision text, p_keluarga_event_id uuid, p_keluarga_timeslot_id uuid, p_target_core_volunteer_id uuid, p_reason_note text, p_actor uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare
  v_row public.historical_attendance_import_rows%rowtype;
  v_event public.phaseone_events%rowtype;
  v_core_volunteer_id uuid;
  v_maklom_volunteer_id text;
  v_roster public.phaseone_roster%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_note text := btrim(coalesce(p_reason_note,''));
  v_timeslot_ids uuid[];
  v_origin_timeslot_id uuid;
  v_origin_roster_id uuid;
  v_existing boolean := false;
  v_transition jsonb;
  v_timeslot_count integer := 0;
  v_checkout_at timestamptz;
begin
  perform maklom_domain.require_editor(p_actor);

  if lower(btrim(coalesce(p_decision,''))) not in ('accept','reject') then
    raise exception 'Decision must be accept or reject' using errcode='22023';
  end if;

  if char_length(v_note) > 500 then
    raise exception 'Review note must be 500 characters or fewer' using errcode='22023';
  end if;

  select * into v_row
  from public.historical_attendance_import_rows
  where id=p_row_id
  for update;

  if not found then
    raise exception 'Staged attendance row not found' using errcode='P0002';
  end if;

  if v_row.row_version <> p_expected_version then
    raise exception 'Staged attendance changed since it was opened. Refresh before reviewing it.'
      using errcode='P0001';
  end if;

  select * into v_event
  from public.phaseone_events
  where id=p_keluarga_event_id;

  if not found then
    raise exception 'Keluarga event not found' using errcode='P0002';
  end if;

  if lower(btrim(p_decision))='reject' then
    update public.historical_attendance_import_rows
    set
      matched_keluarga_event_id=p_keluarga_event_id,
      matched_keluarga_timeslot_id=p_keluarga_timeslot_id,
      decision='rejected',
      decision_note=coalesce(nullif(v_note,''),'Rejected from event workspace'),
      reviewed_at=now(),
      reviewed_by=p_actor
    where id=p_row_id;

    perform audit.write_event(
      'maklom.historical_attendance_rejected',
      'historical_attendance',
      p_row_id,
      jsonb_build_object(
        'event_id',p_keluarga_event_id,
        'timeslot_id',p_keluarga_timeslot_id,
        'source_row_number',v_row.source_row_number,
        'review_note',v_note
      ),
      p_actor,
      null
    );

    return jsonb_build_object('row_id',p_row_id,'decision','rejected');
  end if;

  if (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) is null then
    raise exception 'This staged row has no usable sign-in timestamp' using errcode='22023';
  end if;

  v_checkout_at := (case when v_row.effective_timing_overridden then v_row.effective_sign_out_at else coalesce(v_row.source_check_out_at, case when not (v_row.review_flags && array['feedback_event_mismatch','feedback_ambiguous']::text[]) then v_row.source_feedback_at else null end) end);
  if v_checkout_at is not null and v_checkout_at < (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) then
    raise exception 'Source check-out cannot be before source sign-in' using errcode='22023';
  end if;

  v_core_volunteer_id := coalesce(p_target_core_volunteer_id,v_row.matched_core_volunteer_id);

  if v_core_volunteer_id is null or not exists (
    select 1 from core.volunteers v where v.id=v_core_volunteer_id
  ) then
    raise exception 'Resolve this row to an existing volunteer before accepting attendance'
      using errcode='P0001';
  end if;

  select id into v_maklom_volunteer_id
  from public.volunteers
  where core_volunteer_id=v_core_volunteer_id
  limit 1;

  if p_keluarga_timeslot_id is not null then
    select array_agg(slot.id order by slot.starts_at), count(*)::integer
    into v_timeslot_ids, v_timeslot_count
    from public.phaseone_event_timeslots slot
    where slot.id=p_keluarga_timeslot_id
      and slot.event_id=p_keluarga_event_id
      and slot.status <> 'cancelled'
      and timezone('Asia/Singapore',slot.starts_at)::date=v_row.event_date;

    if v_timeslot_count <> 1 then
      raise exception 'The selected Keluarga shift is unavailable for this attendance date'
        using errcode='P0001';
    end if;
  elsif v_checkout_at is not null then
    select array_agg(slot.id order by slot.starts_at), count(*)::integer
    into v_timeslot_ids, v_timeslot_count
    from public.phaseone_event_timeslots slot
    where slot.event_id=p_keluarga_event_id
      and slot.status <> 'cancelled'
      and timezone('Asia/Singapore',slot.starts_at)::date=v_row.event_date
      and slot.starts_at < v_checkout_at
      and (slot.ends_at is null or slot.ends_at > (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end));

    if v_timeslot_count = 0 then
      raise exception 'No Keluarga shift overlaps the source sign-in/check-out interval'
        using errcode='P0001';
    end if;

    if v_timeslot_count > 1 and exists (
      select 1
      from (
        select
          slot.ends_at,
          lead(slot.starts_at) over (order by slot.starts_at) as next_starts_at
        from public.phaseone_event_timeslots slot
        where slot.id = any(v_timeslot_ids)
      ) ordered_slots
      where ordered_slots.next_starts_at is not null
        and (
          ordered_slots.ends_at is null
          or ordered_slots.ends_at > ordered_slots.next_starts_at
        )
    ) then
      raise exception 'The source attendance overlaps multiple Keluarga shifts. Choose the correct shift before accepting attendance'
        using errcode='P0001';
    end if;
  else
    select array_agg(slot.id order by slot.starts_at), count(*)::integer
    into v_timeslot_ids, v_timeslot_count
    from public.phaseone_event_timeslots slot
    where slot.event_id=p_keluarga_event_id
      and slot.status <> 'cancelled'
      and timezone('Asia/Singapore',slot.starts_at)::date=v_row.event_date
      and slot.starts_at <= (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end)
      and (slot.ends_at is null or (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) < slot.ends_at);

    if v_timeslot_count = 0 then
      raise exception 'No Keluarga shift contains the source sign-in time'
        using errcode='P0001';
    elsif v_timeslot_count > 1 then
      raise exception 'Multiple Keluarga shifts contain the source sign-in time'
        using errcode='P0001';
    end if;
  end if;

  select slot.id
  into v_origin_timeslot_id
  from public.phaseone_event_timeslots slot
  where slot.id = any(v_timeslot_ids)
    and slot.starts_at <= (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end)
    and (slot.ends_at is null or (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end) < slot.ends_at)
  order by slot.starts_at
  limit 1;

  if v_origin_timeslot_id is null then
    v_origin_timeslot_id := v_timeslot_ids[1];
  end if;

  perform public.phaseone_add_database_volunteers_to_roster(
    p_keluarga_event_id,
    v_timeslot_ids,
    array[v_core_volunteer_id],
    p_actor
  );

  select r.id
  into v_origin_roster_id
  from public.phaseone_roster r
  where r.event_id=p_keluarga_event_id
    and r.volunteer_id=v_core_volunteer_id
    and r.timeslot_id=v_origin_timeslot_id
  order by r.id
  limit 1;

  if v_origin_roster_id is null then
    raise exception 'Volunteer roster assignment could not be resolved'
      using errcode='P0001';
  end if;

  select * into v_roster
  from public.phaseone_roster
  where id=v_origin_roster_id
  for update;

  if v_roster.attendance_person_key is null then
    raise exception 'Roster row has no attendance identity key' using errcode='P0001';
  end if;

  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id=p_keluarga_event_id
    and attendance_date=v_row.event_date
    and person_key=v_roster.attendance_person_key
  order by checked_in_at
  limit 1
  for update;

  if found then
    v_existing := true;
  else
    select public.phaseone_apply_attendance_transition(
      p_keluarga_event_id,
      v_origin_roster_id,
      'mark_sign_in',
      (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end),
      coalesce(nullif(v_note,''),'Historical attendance accepted in MakLom'),
      p_actor
    ) into v_transition;

    if nullif(v_transition->>'session_id','') is null then
      raise exception 'Keluarga attendance transition did not create an attendance session'
        using errcode='P0001';
    end if;

    select * into v_session
    from public.phaseone_attendance_sessions
    where id=(v_transition->>'session_id')::uuid
    for update;

    if not found then
      raise exception 'Keluarga attendance session could not be resolved after sign-in'
        using errcode='P0001';
    end if;
  end if;

  if v_checkout_at is not null and v_session.checked_out_at is null then
    perform public.phaseone_apply_attendance_transition(
      p_keluarga_event_id,
      v_origin_roster_id,
      'mark_sign_out',
      v_checkout_at,
      coalesce(nullif(v_note,''),'Historical source check-out accepted in MakLom'),
      p_actor
    );

    select * into v_session
    from public.phaseone_attendance_sessions
    where id=v_session.id;
  end if;

  update public.historical_attendance_import_rows
  set
    matched_core_volunteer_id=v_core_volunteer_id,
    matched_volunteer_id=coalesce(v_maklom_volunteer_id,matched_volunteer_id),
    matched_keluarga_event_id=p_keluarga_event_id,
    matched_keluarga_timeslot_id=v_origin_timeslot_id,
    committed_keluarga_session_id=v_session.id,
    match_status=case when v_existing then 'duplicate' else 'matched' end,
    match_reason=case
      when v_existing then 'Attendance already existed for this Keluarga event session'
      when v_checkout_at is not null and v_timeslot_count > 1
        then 'Accepted as continuous Keluarga attendance across '||v_timeslot_count||' adjacent shifts'
      when v_checkout_at is not null
        then 'Accepted with source sign-in and source check-out'
      else 'Accepted with source sign-in'
    end,
    decision='approved',
    decision_note=coalesce(nullif(v_note,''),'Reviewed against Keluarga event roster'),
    reviewed_at=now(),
    reviewed_by=p_actor
  where id=p_row_id;

  perform audit.write_event(
    case when v_existing
      then 'maklom.historical_attendance_linked_existing'
      else 'maklom.historical_attendance_accepted'
    end,
    'historical_attendance',
    p_row_id,
    jsonb_build_object(
      'event_id',p_keluarga_event_id,
      'origin_timeslot_id',v_origin_timeslot_id,
      'linked_timeslot_ids',to_jsonb(v_timeslot_ids),
      'linked_shift_count',v_timeslot_count,
      'roster_id',v_origin_roster_id,
      'volunteer_id',v_core_volunteer_id,
      'session_id',v_session.id,
      'source_row_number',v_row.source_row_number,
      'source_sign_in_at',(case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end),
      'source_check_out_at',v_checkout_at,
      'existing_session',v_existing,
      'review_note',v_note
    ),
    p_actor,
    null
  );

  return jsonb_build_object(
    'row_id',p_row_id,
    'decision','approved',
    'session_id',v_session.id,
    'existing_session',v_existing,
    'event_id',p_keluarga_event_id,
    'origin_timeslot_id',v_origin_timeslot_id,
    'linked_timeslot_ids',to_jsonb(v_timeslot_ids),
    'linked_shift_count',v_timeslot_count,
    'checked_in_at',v_session.checked_in_at,
    'checked_out_at',v_session.checked_out_at
  );
end;
$function$;

-- Replace public.maklom_commit_historical_attendance_batch, retaining its existing signature, grant and security mode.
CREATE OR REPLACE FUNCTION public.maklom_commit_historical_attendance_batch(p_batch_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_actor uuid := auth.uid();
  v_inserted integer := 0;
  v_duplicate_hits integer := 0;
  v_unready integer := 0;
  v_pending integer := 0;
  v_total integer := 0;
  v_attendance_id text;
  v_existing_attendance_id text;
  v_row record;
begin
  if v_actor is null or not exists (
    select 1
    from public.maklom_scoped_member('ops.write') m
    where m.user_id = v_actor
      and m.active
      and m.role in ('editor','admin')
  ) then
    raise exception 'MakLom editor access is required'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.historical_attendance_import_batches b
    where b.id = p_batch_id
  ) then
    raise exception 'Historical attendance batch not found'
      using errcode = 'P0002';
  end if;

  select count(*)::integer
  into v_unready
  from public.historical_attendance_import_rows r
  left join public.volunteers v on v.id = r.matched_volunteer_id
  left join public.events e on e.id = r.matched_event_id
  left join public.event_shifts s on s.id = r.matched_shift_id
  where r.batch_id = p_batch_id
    and r.decision = 'approved'
    and (
      r.match_status <> 'matched'
      or r.matched_volunteer_id is null
      or r.matched_core_volunteer_id is null
      or v.id is null
      or v.core_volunteer_id is distinct from r.matched_core_volunteer_id
      or r.matched_event_id is null
      or e.id is null
      or (r.matched_shift_id is not null and (s.id is null or s.event_id <> r.matched_event_id))
    );

  if v_unready > 0 then
    raise exception '% approved row(s) are not safe to commit', v_unready
      using errcode = 'P0001';
  end if;

  for v_row in
    select
      r.*,
      e.name as canonical_event_name,
      s.name as canonical_shift_name
    from public.historical_attendance_import_rows r
    join public.volunteers v
      on v.id = r.matched_volunteer_id
     and v.core_volunteer_id = r.matched_core_volunteer_id
    join public.events e on e.id = r.matched_event_id
    left join public.event_shifts s
      on s.id = r.matched_shift_id
     and s.event_id = r.matched_event_id
    where r.batch_id = p_batch_id
      and r.decision = 'approved'
      and r.match_status = 'matched'
      and r.committed_attendance_id is null
    order by r.source_row_number
    for update of r
  loop
    v_existing_attendance_id := null;

    if v_row.matched_shift_id is not null then
      select a.id
        into v_existing_attendance_id
      from public.attendance_log a
      where a.volunteer_id = v_row.matched_volunteer_id
        and a.event_id = v_row.matched_event_id
        and a.shift_id = v_row.matched_shift_id
        and a.event_date = v_row.event_date
        and a.attended = v_row.attended
      order by a.created_at
      limit 1;

      if v_existing_attendance_id is not null then
        update public.historical_attendance_import_rows
        set
          match_status = 'duplicate',
          duplicate_of_attendance_id = v_existing_attendance_id,
          committed_attendance_id = v_existing_attendance_id,
          match_reason = coalesce(match_reason, 'Attendance already exists for this volunteer and canonical shift')
        where id = v_row.id;
        v_duplicate_hits := v_duplicate_hits + 1;
        continue;
      end if;
    end if;

    select a.id
      into v_existing_attendance_id
    from public.attendance_log a
    where a.historical_source_row_hash = v_row.source_row_hash
    limit 1;

    if v_existing_attendance_id is not null then
      update public.historical_attendance_import_rows
      set
        match_status = 'duplicate',
        duplicate_of_attendance_id = v_existing_attendance_id,
        committed_attendance_id = v_existing_attendance_id,
        match_reason = coalesce(match_reason, 'Source row was already committed from an earlier historical import')
      where id = v_row.id;
      v_duplicate_hits := v_duplicate_hits + 1;
      continue;
    end if;

    v_attendance_id :=
      'hist_att_' || substr(md5(v_row.id || '|' || v_row.source_row_hash), 1, 24);

    insert into public.attendance_log (
      id, volunteer_id, name, email, contact, attended, event_name, event_date,
      duration_minutes, sign_in_at, sign_out_at, calculated_duration_minutes,
      staff_credited_duration_minutes, staff_credit_note, event_id, shift_id,
      shift_label, source_kind, historical_import_batch_id,
      historical_source_row_hash, volunteer_role
    )
    values (
      v_attendance_id, v_row.matched_volunteer_id, v_row.full_name, v_row.email,
      v_row.phone, v_row.attended, v_row.canonical_event_name, v_row.event_date,
      case when v_row.attended then v_row.reported_minutes else 0 end,
      (case when v_row.effective_timing_overridden then v_row.effective_sign_in_at else v_row.source_sign_in_at end), null, null, null,
      case when v_row.reported_minutes > 0 then 'Historical import: reviewed duration' else null end,
      v_row.matched_event_id, v_row.matched_shift_id, v_row.canonical_shift_name,
      'historical_import', p_batch_id, v_row.source_row_hash, v_row.volunteer_role
    )
    on conflict (historical_source_row_hash)
      where historical_source_row_hash is not null
    do nothing;

    if found then
      update public.historical_attendance_import_rows
      set committed_attendance_id = v_attendance_id, duplicate_of_attendance_id = null
      where id = v_row.id;
      v_inserted := v_inserted + 1;
    else
      select a.id into v_existing_attendance_id
      from public.attendance_log a
      where a.historical_source_row_hash = v_row.source_row_hash
      limit 1;

      update public.historical_attendance_import_rows
      set
        match_status = 'duplicate',
        duplicate_of_attendance_id = v_existing_attendance_id,
        committed_attendance_id = v_existing_attendance_id,
        match_reason = coalesce(match_reason, 'Source row was committed concurrently or in an earlier import')
      where id = v_row.id;
      v_duplicate_hits := v_duplicate_hits + 1;
    end if;
  end loop;

  select count(*)::integer, count(*) filter (where decision = 'pending')::integer
  into v_total, v_pending
  from public.historical_attendance_import_rows
  where batch_id = p_batch_id;

  update public.historical_attendance_import_batches b
  set
    row_count = v_total,
    matched_count = (select count(*)::integer from public.historical_attendance_import_rows r where r.batch_id = p_batch_id and r.matched_volunteer_id is not null),
    created_volunteer_count = 0,
    review_count = (select count(*)::integer from public.historical_attendance_import_rows r where r.batch_id = p_batch_id and (r.decision = 'pending' or r.match_status in ('needs_review','invalid'))),
    duplicate_count = (select count(*)::integer from public.historical_attendance_import_rows r where r.batch_id = p_batch_id and r.match_status = 'duplicate'),
    imported_count = (select count(*)::integer from public.historical_attendance_import_rows r where r.batch_id = p_batch_id and r.committed_attendance_id is not null and r.match_status <> 'duplicate'),
    total_minutes = (select coalesce(sum(case when r.committed_attendance_id is not null and r.match_status <> 'duplicate' and r.attended then r.reported_minutes else 0 end),0)::integer from public.historical_attendance_import_rows r where r.batch_id = p_batch_id),
    status = case when v_pending > 0 then 'partial' else 'committed' end,
    completed_at = case when v_pending > 0 then null else now() end
  where b.id = p_batch_id;

  return jsonb_build_object(
    'batch_id', p_batch_id,
    'inserted', v_inserted,
    'duplicates', v_duplicate_hits,
    'pending', v_pending,
    'status', case when v_pending > 0 then 'partial' else 'committed' end
  );
end;
$function$;

-- Keep the attendance feed's existing columns and order unchanged.
CREATE OR REPLACE VIEW public.maklom_attendance_feed AS
SELECT a.id,
    a.volunteer_id,
    a.name,
    a.email,
    a.contact,
    a.attended,
    COALESCE(canonical_event.title, a.event_name) AS event_name,
    a.event_date,
    a.duration_minutes,
    COALESCE(a.sign_in_at, source.source_sign_in_at) AS sign_in_at,
    COALESCE(a.sign_out_at, source.source_sign_out_at) AS sign_out_at,
    COALESCE(a.calculated_duration_minutes,
        CASE
            WHEN COALESCE(a.sign_in_at, source.source_sign_in_at) IS NOT NULL AND COALESCE(a.sign_out_at, source.source_sign_out_at) IS NOT NULL THEN GREATEST(floor(EXTRACT(epoch FROM COALESCE(a.sign_out_at, source.source_sign_out_at) - COALESCE(a.sign_in_at, source.source_sign_in_at)) / 60::numeric)::integer, 0)
            ELSE NULL::integer
        END) AS calculated_duration_minutes,
    a.staff_credited_duration_minutes,
    a.staff_credit_note,
    COALESCE(legacy_event.keluarga_event_id::text, a.event_id) AS event_id,
    a.shift_id,
    COALESCE(a.shift_label, legacy_shift.name) AS shift_label,
    a.row_version,
    'maklom'::text AS record_source,
    NULL::text AS contribution_status,
    a.contact_evidence_status
   FROM attendance_log a
     LEFT JOIN events legacy_event ON legacy_event.id = a.event_id
     LEFT JOIN phaseone_events canonical_event ON canonical_event.id = legacy_event.keluarga_event_id
     LEFT JOIN event_shifts legacy_shift ON legacy_shift.id = a.shift_id
     LEFT JOIN LATERAL ( SELECT (CASE WHEN h.effective_timing_overridden THEN h.effective_sign_in_at ELSE h.source_sign_in_at END),
            (CASE WHEN h.effective_timing_overridden THEN h.effective_sign_out_at ELSE COALESCE(h.source_check_out_at, h.source_feedback_at) END) AS source_sign_out_at
           FROM historical_attendance_import_rows h
          WHERE h.decision = 'approved'::text AND COALESCE(h.duplicate_of_attendance_id, h.committed_attendance_id) = a.id
          ORDER BY h.reviewed_at DESC NULLS LAST, h.source_row_number DESC
         LIMIT 1) source ON true
  WHERE NOT (legacy_event.keluarga_event_id IS NOT NULL AND a.volunteer_id IS NOT NULL AND (EXISTS ( SELECT 1
           FROM volunteers linked_volunteer
             JOIN phaseone_roster linked_roster ON linked_roster.volunteer_id = linked_volunteer.core_volunteer_id AND linked_roster.event_id = legacy_event.keluarga_event_id
             JOIN phaseone_attendance_sessions linked_session ON linked_session.event_id = legacy_event.keluarga_event_id AND linked_session.origin_roster_id = linked_roster.id AND linked_session.attendance_date = a.event_date
          WHERE linked_volunteer.id = a.volunteer_id AND linked_session.checked_in_at IS NOT NULL)))
UNION ALL
 SELECT 'keluarga:'::text || s.id::text AS id,
    mv.id AS volunteer_id,
    r.volunteer_name AS name,
    r.email,
    r.mobile AS contact,
    s.checked_in_at IS NOT NULL AS attended,
    e.title AS event_name,
    s.attendance_date AS event_date,
    COALESCE(GREATEST(floor(EXTRACT(epoch FROM s.checked_out_at - s.checked_in_at) / 60::numeric)::integer, 0), 0) AS duration_minutes,
    s.checked_in_at AS sign_in_at,
    s.checked_out_at AS sign_out_at,
        CASE
            WHEN s.checked_in_at IS NOT NULL AND s.checked_out_at IS NOT NULL THEN GREATEST(floor(EXTRACT(epoch FROM s.checked_out_at - s.checked_in_at) / 60::numeric)::integer, 0)
            ELSE NULL::integer
        END AS calculated_duration_minutes,
        CASE
            WHEN c.status = 'approved'::text THEN c.approved_minutes
            ELSE NULL::integer
        END AS staff_credited_duration_minutes,
    c.approval_note AS staff_credit_note,
    s.event_id::text AS event_id,
    NULL::text AS shift_id,
    shift_names.shift_label,
    s.row_version,
    'keluarga'::text AS record_source,
    c.status AS contribution_status,
    'verified'::text AS contact_evidence_status
   FROM phaseone_attendance_sessions s
     JOIN phaseone_events e ON e.id = s.event_id
     JOIN phaseone_roster r ON r.id = s.origin_roster_id
     LEFT JOIN volunteers mv ON mv.core_volunteer_id = r.volunteer_id
     LEFT JOIN volunteer_contributions c ON c.attendance_session_id = s.id
     LEFT JOIN LATERAL ( SELECT string_agg(COALESCE(NULLIF(btrim(t.label), ''::text), 'General'::text), ', '::text ORDER BY t.sort_order, t.starts_at, t.id) AS shift_label
           FROM phaseone_attendance_session_shifts ss
             JOIN phaseone_event_timeslots t ON t.id = ss.timeslot_id
          WHERE ss.session_id = s.id) shift_names ON true;

COMMIT;
