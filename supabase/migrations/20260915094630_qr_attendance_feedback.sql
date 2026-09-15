begin;

alter table public.phaseone_attendance_audit
  alter column changed_by drop not null;

alter table public.phaseone_attendance_audit
  add column if not exists source_type text not null default 'staff';

alter table public.phaseone_attendance_audit
  drop constraint if exists phaseone_attendance_audit_source_type_check;

alter table public.phaseone_attendance_audit
  add constraint phaseone_attendance_audit_source_type_check
  check (source_type in ('staff', 'volunteer_qr', 'system'));

create table if not exists public.phaseone_attendance_qr_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  timeslot_id uuid not null references public.phaseone_event_timeslots(id) on delete cascade,
  action text not null check (action in ('check_in', 'check_out')),
  token_hash text not null unique check (char_length(token_hash) = 64),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint phaseone_attendance_qr_session_expiry_check check (expires_at > created_at)
);

create index if not exists phaseone_attendance_qr_sessions_active_idx
  on public.phaseone_attendance_qr_sessions (event_id, timeslot_id, action, expires_at)
  where revoked_at is null;

alter table public.phaseone_attendance_qr_sessions enable row level security;
revoke all on public.phaseone_attendance_qr_sessions from public, anon, authenticated;
grant select, insert, update, delete on public.phaseone_attendance_qr_sessions to service_role;

create table if not exists public.phaseone_event_feedback (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid references public.phaseone_roster(id) on delete set null,
  volunteer_person_key text not null,
  role_clarity smallint not null check (role_clarity between 1 and 5),
  role_satisfaction smallint not null check (role_satisfaction between 1 and 5),
  staff_support smallint not null check (staff_support between 1 and 5),
  recommend smallint not null check (recommend between 1 and 5),
  suggestions text check (suggestions is null or char_length(suggestions) <= 1500),
  follow_up_requested boolean not null default false,
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (event_id, volunteer_person_key)
);

create index if not exists phaseone_event_feedback_event_idx
  on public.phaseone_event_feedback (event_id, submitted_at desc);

alter table public.phaseone_event_feedback enable row level security;
revoke all on public.phaseone_event_feedback from public, anon, authenticated;
grant select, insert, update, delete on public.phaseone_event_feedback to service_role;

create or replace function public.phaseone_apply_qr_attendance(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz default now()
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_attendance public.phaseone_attendance%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_effective_timestamp timestamptz := coalesce(p_timestamp, now());
  v_date date;
  v_linked_count integer := 0;
  v_closed_count integer := 0;
  v_open record;
begin
  if p_action not in ('check_in', 'check_out') then
    raise exception 'Unsupported QR attendance action';
  end if;

  select * into v_roster
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  select * into v_timeslot
  from public.phaseone_event_timeslots
  where id = v_roster.timeslot_id
    and event_id = p_event_id
    and status <> 'cancelled';
  if not found then raise exception 'Shift is unavailable for this event'; end if;

  v_date := timezone('Asia/Singapore', v_timeslot.starts_at)::date;

  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = v_date
    and person_key = v_roster.attendance_person_key
    and checked_out_at is null
  order by checked_in_at
  limit 1
  for update;

  if p_action = 'check_in' then
    if v_session.id is not null then
      insert into public.phaseone_attendance_session_shifts (
        session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
      ) values (
        v_session.id, p_event_id, p_roster_id, v_roster.timeslot_id,
        case when v_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
        null
      ) on conflict (session_id, roster_id) do nothing;

      return jsonb_build_object(
        'status', 'already_checked_in',
        'session_id', v_session.id,
        'signed_in_at', v_session.checked_in_at,
        'signed_out_at', null,
        'continuous', true
      );
    end if;

    insert into public.phaseone_attendance (event_id, roster_id)
    values (p_event_id, p_roster_id)
    on conflict (event_id, roster_id) do nothing;

    select * into v_attendance
    from public.phaseone_attendance
    where event_id = p_event_id and roster_id = p_roster_id
    for update;

    if v_attendance.non_attendance_status is not null then
      raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status;
    end if;
    if v_attendance.signed_out_at is not null then
      return jsonb_build_object('status', 'already_checked_out', 'signed_out_at', v_attendance.signed_out_at);
    end if;
    if v_attendance.signed_in_at is not null then
      return jsonb_build_object('status', 'already_checked_in', 'signed_in_at', v_attendance.signed_in_at);
    end if;

    update public.phaseone_attendance
    set signed_in_at = v_effective_timestamp,
        signed_in_marked_by = null,
        updated_at = now()
    where id = v_attendance.id
    returning * into v_attendance;

    insert into public.phaseone_attendance_audit (
      event_id, roster_id, attendance_id, action, reason,
      old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at,
      old_non_attendance_status, new_non_attendance_status, changed_by, source_type
    ) values (
      p_event_id, p_roster_id, v_attendance.id, 'mark_sign_in', 'Volunteer QR check-in',
      null, null, v_attendance.signed_in_at, null,
      null, null, null, 'volunteer_qr'
    );

    insert into public.phaseone_attendance_sessions (
      event_id, attendance_date, person_key, origin_roster_id, checked_in_at, checked_in_by
    ) values (
      p_event_id, v_date, v_roster.attendance_person_key, p_roster_id, v_effective_timestamp, null
    )
    returning * into v_session;

    insert into public.phaseone_attendance_session_shifts (
      session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
    )
    select
      v_session.id,
      p_event_id,
      candidate.id,
      candidate.timeslot_id,
      case when candidate.id = p_roster_id then 'origin' else 'scheduled' end,
      null
    from public.phaseone_roster candidate
    join public.phaseone_event_timeslots candidate_slot on candidate_slot.id = candidate.timeslot_id
    left join public.phaseone_attendance candidate_attendance
      on candidate_attendance.event_id = candidate.event_id
      and candidate_attendance.roster_id = candidate.id
    where candidate.event_id = p_event_id
      and candidate.attendance_person_key = v_roster.attendance_person_key
      and candidate_slot.status <> 'cancelled'
      and timezone('Asia/Singapore', candidate_slot.starts_at)::date = v_date
      and candidate_attendance.non_attendance_status is null
      and candidate_attendance.signed_out_at is null
    on conflict (session_id, roster_id) do nothing;

    get diagnostics v_linked_count = row_count;

    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, p_roster_id, 'session_opened',
      jsonb_build_object('checked_in_at', v_effective_timestamp, 'source', 'volunteer_qr', 'linked_shift_count', greatest(v_linked_count - 1, 0)),
      null
    );

    return jsonb_build_object(
      'status', 'checked_in',
      'session_id', v_session.id,
      'signed_in_at', v_effective_timestamp,
      'signed_out_at', null,
      'continuous', true
    );
  end if;

  if v_session.id is null then
    select * into v_attendance
    from public.phaseone_attendance
    where event_id = p_event_id and roster_id = p_roster_id;

    if v_attendance.signed_out_at is not null then
      return jsonb_build_object('status', 'already_checked_out', 'signed_out_at', v_attendance.signed_out_at);
    end if;
    return jsonb_build_object('status', 'not_checked_in');
  end if;

  if v_effective_timestamp < v_session.checked_in_at then
    raise exception 'Check-out cannot be before the event-day check-in';
  end if;

  for v_open in
    select attendance.*
    from public.phaseone_attendance_session_shifts linked
    join public.phaseone_attendance attendance
      on attendance.event_id = linked.event_id
      and attendance.roster_id = linked.roster_id
    where linked.session_id = v_session.id
      and attendance.signed_in_at is not null
      and attendance.signed_out_at is null
      and attendance.non_attendance_status is null
    for update of attendance
  loop
    update public.phaseone_attendance
    set signed_out_at = v_effective_timestamp,
        signed_out_marked_by = null,
        updated_at = now()
    where id = v_open.id;

    insert into public.phaseone_attendance_audit (
      event_id, roster_id, attendance_id, action, reason,
      old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at,
      old_non_attendance_status, new_non_attendance_status, changed_by, source_type
    ) values (
      p_event_id, v_open.roster_id, v_open.id, 'mark_sign_out', 'Volunteer QR check-out',
      v_open.signed_in_at, null, v_open.signed_in_at, v_effective_timestamp,
      null, null, null, 'volunteer_qr'
    );
    v_closed_count := v_closed_count + 1;
  end loop;

  update public.phaseone_attendance_sessions
  set checked_out_at = v_effective_timestamp,
      checked_out_by = null,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.phaseone_attendance_session_audit (
    session_id, event_id, roster_id, action, metadata, changed_by
  ) values (
    v_session.id, p_event_id, p_roster_id, 'session_closed',
    jsonb_build_object('checked_out_at', v_effective_timestamp, 'source', 'volunteer_qr', 'direct_attendance_rows_closed', v_closed_count),
    null
  );

  return jsonb_build_object(
    'status', 'checked_out',
    'session_id', v_session.id,
    'signed_in_at', v_session.checked_in_at,
    'signed_out_at', v_session.checked_out_at,
    'continuous', true
  );
end;
$$;

revoke all on function public.phaseone_apply_qr_attendance(uuid, uuid, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.phaseone_apply_qr_attendance(uuid, uuid, text, timestamptz)
  to service_role;

comment on table public.phaseone_attendance_qr_sessions is
  'Short-lived staff-generated QR sessions for volunteer self check-in and check-out. Raw QR tokens are never stored.';
comment on table public.phaseone_event_feedback is
  'Event-specific volunteer feedback collected after QR check-out; not a canonical volunteer profile.';
comment on function public.phaseone_apply_qr_attendance(uuid, uuid, text, timestamptz) is
  'Service-role-only volunteer QR attendance transaction preserving continuous event-day attendance and explicit volunteer_qr audit provenance.';

commit;
