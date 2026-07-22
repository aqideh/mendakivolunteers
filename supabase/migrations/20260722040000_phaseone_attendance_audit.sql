create table public.phaseone_attendance_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete restrict,
  roster_id uuid not null references public.phaseone_roster(id) on delete restrict,
  attendance_id uuid not null references public.phaseone_attendance(id) on delete restrict,
  action text not null check (action in ('mark_sign_in', 'mark_sign_out', 'clear_sign_in', 'clear_sign_out')),
  reason text not null check (char_length(btrim(reason)) between 5 and 500),
  old_signed_in_at timestamptz,
  old_signed_out_at timestamptz,
  new_signed_in_at timestamptz,
  new_signed_out_at timestamptz,
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index phaseone_attendance_audit_event_changed_idx on public.phaseone_attendance_audit (event_id, changed_at desc);
create index phaseone_attendance_audit_roster_changed_idx on public.phaseone_attendance_audit (roster_id, changed_at desc);
alter table public.phaseone_attendance_audit enable row level security;
revoke all on public.phaseone_attendance_audit from anon, authenticated;

create or replace function public.phaseone_prevent_attendance_audit_mutation()
returns trigger language plpgsql security invoker set search_path = public, pg_temp as $$
begin raise exception 'Attendance audit records are immutable'; end;
$$;
revoke all on function public.phaseone_prevent_attendance_audit_mutation() from public, anon, authenticated;
create trigger phaseone_attendance_audit_immutable before update or delete on public.phaseone_attendance_audit for each row execute function public.phaseone_prevent_attendance_audit_mutation();

create or replace function public.phaseone_apply_attendance_change(
  p_event_id uuid, p_roster_id uuid, p_action text, p_timestamp timestamptz, p_reason text, p_changed_by uuid
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_attendance public.phaseone_attendance%rowtype;
  v_updated public.phaseone_attendance%rowtype;
  v_effective_timestamp timestamptz := coalesce(p_timestamp, now());
  v_reason text := btrim(p_reason);
begin
  if p_action not in ('mark_sign_in', 'mark_sign_out', 'clear_sign_in', 'clear_sign_out') then raise exception 'Unsupported attendance action'; end if;
  if char_length(v_reason) < 5 or char_length(v_reason) > 500 then raise exception 'A reason between 5 and 500 characters is required'; end if;
  if not exists (select 1 from public.phaseone_roster where id = p_roster_id and event_id = p_event_id) then raise exception 'Roster record does not belong to this event'; end if;
  insert into public.phaseone_attendance (event_id, roster_id) values (p_event_id, p_roster_id) on conflict (event_id, roster_id) do nothing;
  select * into v_attendance from public.phaseone_attendance where event_id = p_event_id and roster_id = p_roster_id for update;
  if p_action = 'clear_sign_in' and v_attendance.signed_in_at is null then raise exception 'Sign-in is already clear'; end if;
  if p_action = 'clear_sign_out' and v_attendance.signed_out_at is null then raise exception 'Sign-out is already clear'; end if;
  if p_action = 'mark_sign_in' and v_attendance.signed_out_at is not null and v_effective_timestamp > v_attendance.signed_out_at then raise exception 'Sign-in cannot be after sign-out'; end if;
  if p_action = 'mark_sign_out' and v_attendance.signed_in_at is not null and v_effective_timestamp < v_attendance.signed_in_at then raise exception 'Sign-out cannot be before sign-in'; end if;
  update public.phaseone_attendance set
    signed_in_at = case when p_action = 'mark_sign_in' then v_effective_timestamp when p_action = 'clear_sign_in' then null else signed_in_at end,
    signed_out_at = case when p_action = 'mark_sign_out' then v_effective_timestamp when p_action = 'clear_sign_out' then null else signed_out_at end,
    signed_in_marked_by = case when p_action = 'mark_sign_in' then p_changed_by when p_action = 'clear_sign_in' then null else signed_in_marked_by end,
    signed_out_marked_by = case when p_action = 'mark_sign_out' then p_changed_by when p_action = 'clear_sign_out' then null else signed_out_marked_by end,
    updated_at = now()
  where id = v_attendance.id returning * into v_updated;
  insert into public.phaseone_attendance_audit (event_id, roster_id, attendance_id, action, reason, old_signed_in_at, old_signed_out_at, new_signed_in_at, new_signed_out_at, changed_by)
  values (p_event_id, p_roster_id, v_updated.id, p_action, v_reason, v_attendance.signed_in_at, v_attendance.signed_out_at, v_updated.signed_in_at, v_updated.signed_out_at, p_changed_by);
  return jsonb_build_object('attendance_id', v_updated.id, 'signed_in_at', v_updated.signed_in_at, 'signed_out_at', v_updated.signed_out_at, 'updated_at', v_updated.updated_at);
end;
$$;
revoke all on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid) from public, anon, authenticated;
grant execute on function public.phaseone_apply_attendance_change(uuid, uuid, text, timestamptz, text, uuid) to service_role;