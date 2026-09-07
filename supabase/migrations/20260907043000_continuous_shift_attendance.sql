begin;

alter table public.phaseone_roster
  add column attendance_person_key text;

update public.phaseone_roster
set attendance_person_key = case
  when nullif(btrim(volunteer_key), '') is not null
    then 'id:' || lower(btrim(volunteer_key))
  when nullif(btrim(email), '') is not null
    then 'email:' || lower(btrim(email))
  else 'event:' || id::text
end;

alter table public.phaseone_roster
  alter column attendance_person_key set not null;

alter table public.phaseone_roster
  add constraint phaseone_roster_attendance_person_key_check
  check (attendance_person_key ~ '^(id:|email:|event:).+');

create index phaseone_roster_event_attendance_person_idx
  on public.phaseone_roster (event_id, attendance_person_key);

create unique index phaseone_roster_event_timeslot_attendance_person_uidx
  on public.phaseone_roster (event_id, timeslot_id, attendance_person_key);

create or replace function public.phaseone_assign_attendance_person_key()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.attendance_person_key := case
      when nullif(btrim(new.attendance_person_key), '') is not null
        then lower(btrim(new.attendance_person_key))
      when nullif(btrim(new.volunteer_key), '') is not null
        then 'id:' || lower(btrim(new.volunteer_key))
      when nullif(btrim(new.email), '') is not null
        then 'email:' || lower(btrim(new.email))
      else 'event:' || gen_random_uuid()::text
    end;
    return new;
  end if;

  if new.attendance_person_key is distinct from old.attendance_person_key then
    new.attendance_person_key := lower(btrim(new.attendance_person_key));
    return new;
  end if;

  if old.attendance_person_key like 'event:%' then
    if nullif(btrim(new.volunteer_key), '') is not null then
      new.attendance_person_key := 'id:' || lower(btrim(new.volunteer_key));
    elsif nullif(btrim(new.email), '') is not null then
      new.attendance_person_key := 'email:' || lower(btrim(new.email));
    end if;
  end if;

  return new;
end;
$$;

create trigger phaseone_roster_assign_attendance_person_key
before insert or update of volunteer_key, email, attendance_person_key
on public.phaseone_roster
for each row execute function public.phaseone_assign_attendance_person_key();

comment on column public.phaseone_roster.attendance_person_key is
  'Stable event-day attendance identity. Uses volunteer ID first, then normalized email. Rows without either receive an opaque event-only key and are never auto-matched by name.';

create table public.phaseone_attendance_sessions (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  attendance_date date not null,
  person_key text not null,
  origin_roster_id uuid not null references public.phaseone_roster(id) on delete restrict,
  checked_in_at timestamptz not null,
  checked_out_at timestamptz,
  checked_in_by uuid references auth.users(id) on delete set null,
  checked_out_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_attendance_sessions_person_key_check
    check (person_key ~ '^(id:|email:|event:).+'),
  constraint phaseone_attendance_sessions_time_order_check
    check (checked_out_at is null or checked_out_at >= checked_in_at)
);

create unique index phaseone_attendance_sessions_one_open_idx
  on public.phaseone_attendance_sessions (event_id, attendance_date, person_key)
  where checked_out_at is null;

create index phaseone_attendance_sessions_event_date_idx
  on public.phaseone_attendance_sessions (event_id, attendance_date, checked_in_at desc);

create table public.phaseone_attendance_session_shifts (
  session_id uuid not null references public.phaseone_attendance_sessions(id) on delete cascade,
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  timeslot_id uuid not null references public.phaseone_event_timeslots(id) on delete cascade,
  continuation_type text not null,
  linked_by uuid references auth.users(id) on delete set null,
  linked_at timestamptz not null default now(),
  primary key (session_id, roster_id),
  constraint phaseone_attendance_session_shifts_type_check
    check (continuation_type in ('origin', 'scheduled', 'extended_on_site'))
);

create index phaseone_attendance_session_shifts_event_roster_idx
  on public.phaseone_attendance_session_shifts (event_id, roster_id, session_id);

create index phaseone_attendance_session_shifts_timeslot_idx
  on public.phaseone_attendance_session_shifts (event_id, timeslot_id, session_id);

create table public.phaseone_attendance_session_audit (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.phaseone_attendance_sessions(id) on delete set null,
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid references public.phaseone_roster(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  constraint phaseone_attendance_session_audit_action_check
    check (action in ('session_opened', 'scheduled_shifts_linked', 'shift_extended', 'session_closed', 'session_backfilled')),
  constraint phaseone_attendance_session_audit_metadata_check
    check (jsonb_typeof(metadata) = 'object')
);

create index phaseone_attendance_session_audit_event_time_idx
  on public.phaseone_attendance_session_audit (event_id, changed_at desc);

alter table public.phaseone_attendance_sessions enable row level security;
alter table public.phaseone_attendance_session_shifts enable row level security;
alter table public.phaseone_attendance_session_audit enable row level security;

revoke all on public.phaseone_attendance_sessions from anon, authenticated;
revoke all on public.phaseone_attendance_session_shifts from anon, authenticated;
revoke all on public.phaseone_attendance_session_audit from anon, authenticated;

grant all on public.phaseone_attendance_sessions to service_role;
grant all on public.phaseone_attendance_session_shifts to service_role;
grant all on public.phaseone_attendance_session_audit to service_role;

create or replace function public.phaseone_open_attendance_session(
  p_event_id uuid,
  p_roster_id uuid,
  p_checked_in_at timestamptz,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_date date;
  v_created boolean := false;
  v_linked_count integer := 0;
begin
  select * into v_roster
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;

  select * into v_timeslot
  from public.phaseone_event_timeslots
  where id = v_roster.timeslot_id and event_id = p_event_id;
  if not found or v_timeslot.status = 'cancelled' then raise exception 'Shift is unavailable for this event'; end if;
  if p_checked_in_at is null then raise exception 'Continuous attendance requires a check-in timestamp'; end if;

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

  if not found then
    insert into public.phaseone_attendance_sessions (
      event_id, attendance_date, person_key, origin_roster_id, checked_in_at, checked_in_by
    ) values (
      p_event_id, v_date, v_roster.attendance_person_key, p_roster_id, p_checked_in_at, p_changed_by
    )
    on conflict do nothing
    returning * into v_session;

    if found then
      v_created := true;
    else
      select * into v_session
      from public.phaseone_attendance_sessions
      where event_id = p_event_id
        and attendance_date = v_date
        and person_key = v_roster.attendance_person_key
        and checked_out_at is null
      order by checked_in_at
      limit 1
      for update;
    end if;
  end if;

  if v_session.id is null then raise exception 'Continuous attendance session could not be created'; end if;

  insert into public.phaseone_attendance_session_shifts (
    session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
  ) values (
    v_session.id,
    p_event_id,
    p_roster_id,
    v_roster.timeslot_id,
    case when v_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
    p_changed_by
  ) on conflict (session_id, roster_id) do nothing;

  if v_roster.attendance_person_key like 'id:%' or v_roster.attendance_person_key like 'email:%' then
    insert into public.phaseone_attendance_session_shifts (
      session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
    )
    select
      v_session.id,
      p_event_id,
      candidate.id,
      candidate.timeslot_id,
      case when candidate.id = v_session.origin_roster_id then 'origin' else 'scheduled' end,
      p_changed_by
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
  end if;

  select count(*) into v_linked_count
  from public.phaseone_attendance_session_shifts
  where session_id = v_session.id and roster_id <> v_session.origin_roster_id;

  if v_created then
    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, p_roster_id, 'session_opened',
      jsonb_build_object('checked_in_at', p_checked_in_at), p_changed_by
    );

    if v_linked_count > 0 then
      insert into public.phaseone_attendance_session_audit (
        session_id, event_id, roster_id, action, metadata, changed_by
      ) values (
        v_session.id, p_event_id, p_roster_id, 'scheduled_shifts_linked',
        jsonb_build_object('linked_shift_count', v_linked_count), p_changed_by
      );
    end if;
  end if;

  return jsonb_build_object(
    'session_id', v_session.id,
    'origin_roster_id', v_session.origin_roster_id,
    'attendance_date', v_session.attendance_date,
    'signed_in_at', v_session.checked_in_at,
    'signed_out_at', v_session.checked_out_at,
    'continuous', true
  );
end;
$$;

create or replace function public.phaseone_close_attendance_session(
  p_event_id uuid,
  p_roster_id uuid,
  p_timestamp timestamptz,
  p_reason text,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_date date;
  v_effective_timestamp timestamptz := coalesce(p_timestamp, now());
  v_open record;
  v_closed_count integer := 0;
begin
  select * into v_roster from public.phaseone_roster where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;
  select * into v_timeslot from public.phaseone_event_timeslots where id = v_roster.timeslot_id and event_id = p_event_id;
  if not found then raise exception 'Shift is unavailable for this event'; end if;

  v_date := timezone('Asia/Singapore', v_timeslot.starts_at)::date;
  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = v_date
    and person_key = v_roster.attendance_person_key
    and checked_out_at is null
  order by checked_in_at limit 1 for update;

  if not found then return null; end if;
  if v_effective_timestamp < v_session.checked_in_at then raise exception 'Check-out cannot be before the event-day check-in'; end if;

  for v_open in
    select attendance.roster_id
    from public.phaseone_attendance_session_shifts linked
    join public.phaseone_attendance attendance
      on attendance.event_id = linked.event_id and attendance.roster_id = linked.roster_id
    where linked.session_id = v_session.id
      and attendance.signed_in_at is not null
      and attendance.signed_out_at is null
      and attendance.non_attendance_status is null
  loop
    perform public.phaseone_apply_attendance_change(
      p_event_id, v_open.roster_id, 'mark_sign_out', v_effective_timestamp, p_reason, p_changed_by
    );
    v_closed_count := v_closed_count + 1;
  end loop;

  update public.phaseone_attendance_sessions
  set checked_out_at = v_effective_timestamp,
      checked_out_by = p_changed_by,
      updated_at = now()
  where id = v_session.id
  returning * into v_session;

  insert into public.phaseone_attendance_session_audit (
    session_id, event_id, roster_id, action, metadata, changed_by
  ) values (
    v_session.id, p_event_id, p_roster_id, 'session_closed',
    jsonb_build_object('checked_out_at', v_effective_timestamp, 'direct_attendance_rows_closed', v_closed_count),
    p_changed_by
  );

  return jsonb_build_object(
    'session_id', v_session.id,
    'origin_roster_id', v_session.origin_roster_id,
    'signed_in_at', v_session.checked_in_at,
    'signed_out_at', v_session.checked_out_at,
    'updated_at', v_session.updated_at,
    'continuous', true
  );
end;
$$;

create or replace function public.phaseone_extend_attendance_session(
  p_event_id uuid,
  p_source_roster_id uuid,
  p_target_timeslot_id uuid,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.phaseone_roster%rowtype;
  v_source_slot public.phaseone_event_timeslots%rowtype;
  v_target_slot public.phaseone_event_timeslots%rowtype;
  v_session public.phaseone_attendance_sessions%rowtype;
  v_target_roster_id uuid;
  v_existing_type text;
  v_created boolean := false;
begin
  if not exists (select 1 from auth.users where id = p_changed_by) then raise exception 'Staff user not found'; end if;

  select * into v_source from public.phaseone_roster where id = p_source_roster_id and event_id = p_event_id;
  if not found then raise exception 'Source roster record does not belong to this event'; end if;

  select * into v_source_slot from public.phaseone_event_timeslots where id = v_source.timeslot_id and event_id = p_event_id;
  select * into v_target_slot
  from public.phaseone_event_timeslots
  where id = p_target_timeslot_id and event_id = p_event_id and status <> 'cancelled';
  if v_target_slot.id is null then raise exception 'Target shift is unavailable for this event'; end if;

  if timezone('Asia/Singapore', v_source_slot.starts_at)::date <> timezone('Asia/Singapore', v_target_slot.starts_at)::date
    or v_target_slot.starts_at <= v_source_slot.starts_at then
    raise exception 'A shift extension must move to a later shift on the same day';
  end if;

  select * into v_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id
    and attendance_date = timezone('Asia/Singapore', v_source_slot.starts_at)::date
    and person_key = v_source.attendance_person_key
    and checked_out_at is null
  order by checked_in_at limit 1 for update;
  if not found then raise exception 'Volunteer is not currently checked in'; end if;

  select id into v_target_roster_id
  from public.phaseone_roster
  where event_id = p_event_id
    and timeslot_id = p_target_timeslot_id
    and attendance_person_key = v_source.attendance_person_key
  limit 1;

  if v_target_roster_id is null then
    insert into public.phaseone_roster (
      event_id, timeslot_id, volunteer_key, volunteer_name, email, mobile,
      tshirt_size, entry_method, attendance_person_key, uploaded_by, uploaded_at
    ) values (
      p_event_id, p_target_timeslot_id, v_source.volunteer_key, v_source.volunteer_name,
      v_source.email, v_source.mobile, v_source.tshirt_size, 'walk_in',
      v_source.attendance_person_key, p_changed_by, now()
    )
    on conflict do nothing
    returning id into v_target_roster_id;

    if v_target_roster_id is null then
      select id into v_target_roster_id
      from public.phaseone_roster
      where event_id = p_event_id
        and timeslot_id = p_target_timeslot_id
        and attendance_person_key = v_source.attendance_person_key
      limit 1;
    else
      v_created := true;
    end if;
  end if;

  if v_target_roster_id is null then
    raise exception 'Could not safely create the next-shift assignment. Add a volunteer ID or email before extending this volunteer.';
  end if;

  select continuation_type into v_existing_type
  from public.phaseone_attendance_session_shifts
  where session_id = v_session.id and roster_id = v_target_roster_id;

  if v_existing_type is null then
    insert into public.phaseone_attendance_session_shifts (
      session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
    ) values (
      v_session.id, p_event_id, v_target_roster_id, p_target_timeslot_id, 'extended_on_site', p_changed_by
    );

    insert into public.phaseone_attendance_session_audit (
      session_id, event_id, roster_id, action, metadata, changed_by
    ) values (
      v_session.id, p_event_id, v_target_roster_id, 'shift_extended',
      jsonb_build_object('source_roster_id', p_source_roster_id, 'target_timeslot_id', p_target_timeslot_id, 'roster_created', v_created),
      p_changed_by
    );

    v_existing_type := 'extended_on_site';
  end if;

  return jsonb_build_object(
    'status', case when v_existing_type = 'scheduled' then 'already_scheduled' else 'extended' end,
    'session_id', v_session.id,
    'target_roster_id', v_target_roster_id,
    'continuation_type', v_existing_type,
    'roster_created', v_created
  );
end;
$$;

create or replace function public.phaseone_apply_attendance_transition(
  p_event_id uuid,
  p_roster_id uuid,
  p_action text,
  p_timestamp timestamptz,
  p_reason text,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_attendance public.phaseone_attendance%rowtype;
  v_roster public.phaseone_roster%rowtype;
  v_timeslot public.phaseone_event_timeslots%rowtype;
  v_open_session public.phaseone_attendance_sessions%rowtype;
  v_result jsonb;
  v_session_result jsonb;
  v_date date;
begin
  if p_action not in ('mark_sign_in', 'mark_sign_out', 'mark_withdrawn', 'mark_absent', 'clear_non_attendance') then
    raise exception 'Unsupported attendance transition';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then raise exception 'Staff user not found'; end if;

  select * into v_roster from public.phaseone_roster where id = p_roster_id and event_id = p_event_id;
  if not found then raise exception 'Roster record does not belong to this event'; end if;
  select * into v_timeslot from public.phaseone_event_timeslots where id = v_roster.timeslot_id and event_id = p_event_id;
  if not found then raise exception 'Shift is unavailable for this event'; end if;

  v_date := timezone('Asia/Singapore', v_timeslot.starts_at)::date;
  select * into v_open_session
  from public.phaseone_attendance_sessions
  where event_id = p_event_id and attendance_date = v_date
    and person_key = v_roster.attendance_person_key and checked_out_at is null
  order by checked_in_at limit 1 for update;

  if p_action = 'mark_sign_out' and v_open_session.id is not null then
    return public.phaseone_close_attendance_session(
      p_event_id, p_roster_id, p_timestamp, p_reason, p_changed_by
    );
  end if;

  insert into public.phaseone_attendance (event_id, roster_id)
  values (p_event_id, p_roster_id)
  on conflict (event_id, roster_id) do nothing;

  select * into v_attendance
  from public.phaseone_attendance
  where event_id = p_event_id and roster_id = p_roster_id
  for update;

  if p_action = 'mark_sign_in' then
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status; end if;
    if v_open_session.id is not null then
      insert into public.phaseone_attendance_session_shifts (
        session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
      ) values (
        v_open_session.id, p_event_id, p_roster_id, v_roster.timeslot_id,
        case when v_open_session.origin_roster_id = p_roster_id then 'origin' else 'scheduled' end,
        p_changed_by
      ) on conflict (session_id, roster_id) do nothing;

      return jsonb_build_object(
        'session_id', v_open_session.id,
        'origin_roster_id', v_open_session.origin_roster_id,
        'signed_in_at', v_open_session.checked_in_at,
        'signed_out_at', null,
        'updated_at', v_open_session.updated_at,
        'continuous', true,
        'already_on_site', true
      );
    end if;
    if v_attendance.signed_in_at is not null then raise exception 'Volunteer is already checked in'; end if;
    if v_attendance.signed_out_at is not null then raise exception 'Cannot check in after check-out has been recorded'; end if;
  elsif p_action = 'mark_sign_out' then
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is marked as %', v_attendance.non_attendance_status; end if;
    if v_attendance.signed_in_at is null then raise exception 'Volunteer must be checked in before check-out'; end if;
    if v_attendance.signed_out_at is not null then raise exception 'Volunteer is already checked out'; end if;
  elsif p_action in ('mark_withdrawn', 'mark_absent') then
    if v_open_session.id is not null then raise exception 'Volunteer is currently checked in'; end if;
    if v_attendance.non_attendance_status is not null then raise exception 'Volunteer is already marked as %', v_attendance.non_attendance_status; end if;
    if v_attendance.signed_in_at is not null or v_attendance.signed_out_at is not null then raise exception 'Attendance has already been recorded for this volunteer'; end if;
  else
    if v_attendance.non_attendance_status is null then raise exception 'Volunteer is not marked as withdrawn or absent'; end if;
  end if;

  select public.phaseone_apply_attendance_change(
    p_event_id, p_roster_id, p_action, p_timestamp, p_reason, p_changed_by
  ) into v_result;

  if p_action = 'mark_sign_in' then
    select public.phaseone_open_attendance_session(
      p_event_id, p_roster_id, (v_result->>'signed_in_at')::timestamptz, p_changed_by
    ) into v_session_result;

    v_result := v_result || jsonb_build_object(
      'session_id', v_session_result->>'session_id',
      'continuous', true
    );
  end if;

  return v_result;
end;
$$;

revoke all on function public.phaseone_open_attendance_session(uuid, uuid, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.phaseone_close_attendance_session(uuid, uuid, timestamptz, text, uuid) from public, anon, authenticated;
revoke all on function public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid) from public, anon, authenticated;

grant execute on function public.phaseone_open_attendance_session(uuid, uuid, timestamptz, uuid) to service_role;
grant execute on function public.phaseone_close_attendance_session(uuid, uuid, timestamptz, text, uuid) to service_role;
grant execute on function public.phaseone_extend_attendance_session(uuid, uuid, uuid, uuid) to service_role;
grant execute on function public.phaseone_apply_attendance_transition(uuid, uuid, text, timestamptz, text, uuid) to service_role;

-- Preserve live check-ins when this migration is deployed. Existing open rows are
-- grouped by safe event-day identity into one continuous session; no attendance
-- timestamps are changed by the backfill.
with open_rows as (
  select
    attendance.event_id,
    roster.id as roster_id,
    roster.attendance_person_key as person_key,
    timezone('Asia/Singapore', timeslot.starts_at)::date as attendance_date,
    attendance.signed_in_at,
    coalesce(attendance.signed_in_marked_by, roster.uploaded_by) as checked_in_by
  from public.phaseone_attendance attendance
  join public.phaseone_roster roster on roster.id = attendance.roster_id
  join public.phaseone_event_timeslots timeslot on timeslot.id = roster.timeslot_id
  where attendance.signed_in_at is not null
    and attendance.signed_out_at is null
    and attendance.non_attendance_status is null
), origins as (
  select distinct on (event_id, attendance_date, person_key)
    event_id, attendance_date, person_key, roster_id, signed_in_at, checked_in_by
  from open_rows
  order by event_id, attendance_date, person_key, signed_in_at, roster_id
)
insert into public.phaseone_attendance_sessions (
  event_id, attendance_date, person_key, origin_roster_id, checked_in_at, checked_in_by
)
select event_id, attendance_date, person_key, roster_id, signed_in_at, checked_in_by
from origins
on conflict do nothing;

insert into public.phaseone_attendance_session_shifts (
  session_id, event_id, roster_id, timeslot_id, continuation_type, linked_by
)
select
  session.id,
  session.event_id,
  roster.id,
  roster.timeslot_id,
  case when roster.id = session.origin_roster_id then 'origin' else 'scheduled' end,
  session.checked_in_by
from public.phaseone_attendance_sessions session
join public.phaseone_roster roster
  on roster.event_id = session.event_id and roster.attendance_person_key = session.person_key
join public.phaseone_event_timeslots timeslot on timeslot.id = roster.timeslot_id
left join public.phaseone_attendance attendance
  on attendance.event_id = roster.event_id and attendance.roster_id = roster.id
where session.checked_out_at is null
  and timeslot.status <> 'cancelled'
  and timezone('Asia/Singapore', timeslot.starts_at)::date = session.attendance_date
  and attendance.non_attendance_status is null
  and attendance.signed_out_at is null
on conflict (session_id, roster_id) do nothing;

insert into public.phaseone_attendance_session_audit (
  session_id, event_id, roster_id, action, metadata, changed_by
)
select
  session.id,
  session.event_id,
  session.origin_roster_id,
  'session_backfilled',
  jsonb_build_object('checked_in_at', session.checked_in_at),
  session.checked_in_by
from public.phaseone_attendance_sessions session
where session.checked_out_at is null;

commit;
