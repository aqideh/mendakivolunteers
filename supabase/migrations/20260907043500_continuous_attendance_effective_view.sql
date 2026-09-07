begin;

create view public.phaseone_attendance_effective
with (security_invoker = true)
as
select
  roster.event_id,
  roster.id as roster_id,
  attendance.id,
  coalesce(attendance.signed_in_at, session.checked_in_at) as signed_in_at,
  coalesce(attendance.signed_out_at, session.checked_out_at) as signed_out_at,
  attendance.non_attendance_status,
  attendance.non_attendance_marked_at,
  greatest(
    coalesce(attendance.updated_at, '-infinity'::timestamptz),
    coalesce(session.updated_at, '-infinity'::timestamptz),
    coalesce(linked.linked_at, '-infinity'::timestamptz)
  ) as updated_at,
  session.id as session_id,
  session.checked_in_at as session_checked_in_at,
  session.checked_out_at as session_checked_out_at,
  linked.continuation_type
from public.phaseone_roster roster
left join public.phaseone_attendance attendance
  on attendance.event_id = roster.event_id
  and attendance.roster_id = roster.id
left join lateral (
  select shift_link.*
  from public.phaseone_attendance_session_shifts shift_link
  join public.phaseone_attendance_sessions session_candidate
    on session_candidate.id = shift_link.session_id
  where shift_link.event_id = roster.event_id
    and shift_link.roster_id = roster.id
  order by
    (session_candidate.checked_out_at is null) desc,
    session_candidate.checked_in_at desc
  limit 1
) linked on true
left join public.phaseone_attendance_sessions session
  on session.id = linked.session_id;

revoke all on public.phaseone_attendance_effective from anon, authenticated;
grant select on public.phaseone_attendance_effective to service_role;

comment on view public.phaseone_attendance_effective is
  'Server-only operational read model. Carries an open event-day attendance session across linked shift roster rows without writing synthetic check-in records.';

commit;
