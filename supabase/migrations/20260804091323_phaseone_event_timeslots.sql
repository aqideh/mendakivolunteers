create table public.phaseone_event_timeslots (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  label text,
  starts_at timestamp with time zone not null,
  ends_at timestamp with time zone,
  status text not null default 'scheduled',
  sort_order integer not null default 0,
  created_at timestamp with time zone not null default now(),
  constraint phaseone_event_timeslots_label_length check (
    label is null or char_length(trim(label)) between 1 and 120
  ),
  constraint phaseone_event_timeslots_time_order check (
    ends_at is null or ends_at > starts_at
  ),
  constraint phaseone_event_timeslots_status check (
    status in ('scheduled', 'cancelled')
  ),
  constraint phaseone_event_timeslots_sort_order check (
    sort_order between 0 and 9999
  )
);

create index phaseone_event_timeslots_event_start_idx
  on public.phaseone_event_timeslots (event_id, starts_at, sort_order, id);
create index phaseone_event_timeslots_visible_range_idx
  on public.phaseone_event_timeslots (starts_at, ends_at);

alter table public.phaseone_event_timeslots enable row level security;
revoke all on table public.phaseone_event_timeslots from public, anon, authenticated;
grant select, insert, update, delete on table public.phaseone_event_timeslots to service_role;

insert into public.phaseone_event_timeslots (
  event_id, label, starts_at, ends_at, status, sort_order
)
select id, null, reporting_at, null, 'scheduled', 0
from public.phaseone_events
where reporting_at is not null;

alter table public.phaseone_events
  drop constraint if exists phaseone_events_published_location;
alter table public.phaseone_events
  add constraint phaseone_events_published_location check (
    not is_published
    or (venue is not null and navigation_destination is not null)
  );

create or replace function public.phaseone_replace_event_timeslots(
  p_event_id uuid,
  p_timeslots jsonb
)
returns void
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
begin
  if jsonb_typeof(p_timeslots) is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Timeslots must be supplied as a JSON array.';
  end if;
  if jsonb_array_length(p_timeslots) > 100 then
    raise exception using errcode = '22023', message = 'A package cannot contain more than 100 timeslots.';
  end if;
  if not exists (
    select 1 from public.phaseone_events where id = p_event_id for update
  ) then
    raise exception using errcode = 'P0002', message = 'Volunteer package could not be found.';
  end if;
  if exists (
    select 1
    from jsonb_to_recordset(p_timeslots) as incoming(id uuid)
    join public.phaseone_event_timeslots existing on existing.id = incoming.id
    where incoming.id is not null and existing.event_id <> p_event_id
  ) then
    raise exception using errcode = '23503', message = 'A timeslot does not belong to this volunteer package.';
  end if;

  delete from public.phaseone_event_timeslots existing
  where existing.event_id = p_event_id
    and not exists (
      select 1
      from jsonb_to_recordset(p_timeslots) as incoming(id uuid)
      where incoming.id = existing.id
    );

  insert into public.phaseone_event_timeslots (
    id, event_id, label, starts_at, ends_at, status, sort_order
  )
  select
    coalesce(incoming.id, gen_random_uuid()),
    p_event_id,
    nullif(trim(incoming.label), ''),
    incoming.starts_at,
    incoming.ends_at,
    coalesce(incoming.status, 'scheduled'),
    coalesce(incoming.sort_order, 0)
  from jsonb_to_recordset(p_timeslots) as incoming(
    id uuid,
    label text,
    starts_at timestamp with time zone,
    ends_at timestamp with time zone,
    status text,
    sort_order integer
  )
  on conflict (id) do update
  set
    label = excluded.label,
    starts_at = excluded.starts_at,
    ends_at = excluded.ends_at,
    status = excluded.status,
    sort_order = excluded.sort_order
  where public.phaseone_event_timeslots.event_id = p_event_id;
end;
$$;

revoke all on function public.phaseone_replace_event_timeslots(uuid, jsonb)
  from public, anon, authenticated;
grant execute on function public.phaseone_replace_event_timeslots(uuid, jsonb)
  to service_role;

create or replace function public.phaseone_assert_published_event_has_timeslots()
returns trigger
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  affected_event_ids uuid[];
begin
  if tg_table_name = 'phaseone_events' then
    affected_event_ids := array[new.id];
  elsif tg_op = 'DELETE' then
    affected_event_ids := array[old.event_id];
  else
    affected_event_ids := array[old.event_id, new.event_id];
  end if;

  if exists (
    select 1
    from public.phaseone_events event
    where event.id = any(affected_event_ids)
      and event.is_published
      and not exists (
        select 1 from public.phaseone_event_timeslots timeslot
        where timeslot.event_id = event.id
      )
  ) then
    raise exception using errcode = '23514', message = 'Published packages require at least one timeslot.';
  end if;

  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

revoke all on function public.phaseone_assert_published_event_has_timeslots()
  from public, anon, authenticated;

create constraint trigger phaseone_events_require_timeslot
  after insert or update of is_published on public.phaseone_events
  deferrable initially deferred
  for each row execute function public.phaseone_assert_published_event_has_timeslots();

create constraint trigger phaseone_timeslots_keep_published_schedule
  after delete or update of event_id on public.phaseone_event_timeslots
  deferrable initially deferred
  for each row execute function public.phaseone_assert_published_event_has_timeslots();

comment on table public.phaseone_event_timeslots is
  'Ordered reporting dates and times for a phase-one volunteer package.';
comment on column public.phaseone_event_timeslots.label is
  'Optional volunteer-facing shift label, such as Morning shift.';
comment on column public.phaseone_event_timeslots.ends_at is
  'Optional end time. Existing single reporting timestamps are migrated without inventing an end time.';
comment on column public.phaseone_events.reporting_at is
  'Compatibility projection of the earliest timeslot. Volunteer package scheduling is stored in phaseone_event_timeslots.';
