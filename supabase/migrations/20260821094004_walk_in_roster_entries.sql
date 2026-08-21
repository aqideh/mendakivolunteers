alter table public.phaseone_roster
  add column if not exists entry_method text not null default 'roster_import';

alter table public.phaseone_roster
  drop constraint if exists phaseone_roster_entry_method_check;

alter table public.phaseone_roster
  add constraint phaseone_roster_entry_method_check
  check (entry_method in ('roster_import', 'walk_in'));

comment on column public.phaseone_roster.entry_method is
  'Operational source of the roster assignment: roster_import for preloaded rosters, walk_in for last-minute event-day additions.';

create or replace function public.phaseone_add_walk_in_volunteer(
  p_event_id uuid,
  p_timeslot_id uuid,
  p_volunteer_key text,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_tshirt_size text,
  p_check_in boolean,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_volunteer_key text := nullif(btrim(coalesce(p_volunteer_key, '')), '');
  v_volunteer_name text := btrim(coalesce(p_volunteer_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  v_tshirt_size text := nullif(btrim(coalesce(p_tshirt_size, '')), '');
  v_match_key text;
  v_roster_id uuid;
  v_attendance jsonb;
begin
  if not exists (select 1 from public.phaseone_events where id = p_event_id) then
    raise exception 'Event not found';
  end if;

  if not exists (
    select 1
    from public.phaseone_event_timeslots
    where id = p_timeslot_id
      and event_id = p_event_id
      and status <> 'cancelled'
  ) then
    raise exception 'Shift is unavailable for this event';
  end if;

  if v_volunteer_name = '' or char_length(v_volunteer_name) > 200 then
    raise exception 'Volunteer name must be between 1 and 200 characters';
  end if;
  if v_volunteer_key is not null and char_length(v_volunteer_key) > 100 then
    raise exception 'Volunteer ID must be 100 characters or fewer';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    raise exception 'Email must be 320 characters or fewer';
  end if;
  if v_mobile is not null and char_length(v_mobile) > 50 then
    raise exception 'Contact number must be 50 characters or fewer';
  end if;
  if v_tshirt_size is not null and char_length(v_tshirt_size) > 20 then
    raise exception 'T-shirt size must be 20 characters or fewer';
  end if;
  if p_check_in is null then
    raise exception 'Check-in choice is required';
  end if;
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;

  v_match_key := case
    when v_volunteer_key is not null then 'id:' || lower(v_volunteer_key)
    when v_email is not null then 'email:' || lower(v_email)
    when nullif(regexp_replace(coalesce(v_mobile, ''), '\D', '', 'g'), '') is not null
      then 'mobile:' || regexp_replace(coalesce(v_mobile, ''), '\D', '', 'g')
    else 'name:' || lower(btrim(regexp_replace(v_volunteer_name, '\s+', ' ', 'g')))
  end;

  insert into public.phaseone_roster (
    event_id,
    timeslot_id,
    volunteer_key,
    volunteer_name,
    email,
    mobile,
    tshirt_size,
    entry_method,
    uploaded_by,
    uploaded_at
  ) values (
    p_event_id,
    p_timeslot_id,
    v_volunteer_key,
    v_volunteer_name,
    v_email,
    v_mobile,
    v_tshirt_size,
    'walk_in',
    p_changed_by,
    now()
  )
  on conflict (event_id, timeslot_id, roster_match_key) do nothing
  returning id into v_roster_id;

  if v_roster_id is null then
    select id into v_roster_id
    from public.phaseone_roster
    where event_id = p_event_id
      and timeslot_id = p_timeslot_id
      and roster_match_key = v_match_key
    limit 1;

    return jsonb_build_object(
      'status', 'duplicate',
      'roster_id', v_roster_id,
      'checked_in', false
    );
  end if;

  if p_check_in then
    select public.phaseone_apply_attendance_change(
      p_event_id,
      v_roster_id,
      'mark_sign_in',
      null,
      'Last-minute volunteer added and checked in',
      p_changed_by
    ) into v_attendance;
  end if;

  return jsonb_build_object(
    'status', 'created',
    'roster_id', v_roster_id,
    'checked_in', p_check_in,
    'attendance', v_attendance
  );
end;
$$;

revoke all on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, boolean, uuid
) from public, anon, authenticated;

grant execute on function public.phaseone_add_walk_in_volunteer(
  uuid, uuid, text, text, text, text, text, boolean, uuid
) to service_role;
