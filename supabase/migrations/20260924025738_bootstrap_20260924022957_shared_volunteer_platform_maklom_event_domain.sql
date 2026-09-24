
create table if not exists public.events (
  id text primary key,
  name text not null,
  start_date date not null,
  end_date date not null,
  programme text,
  venue text,
  notes text,
  status text not null default 'active' check (status in ('active','archived')),
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  row_version bigint not null default 1,
  check (end_date >= start_date)
);
create table if not exists public.event_shifts (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  name text not null,
  shift_date date not null,
  start_time time,
  end_time time,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  row_version bigint not null default 1
);
create table if not exists public.event_impact_metrics (
  id text primary key,
  event_id text not null references public.events(id) on delete cascade,
  label text not null,
  value numeric not null check (value >= 0),
  unit text,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid default auth.uid(),
  row_version bigint not null default 1
);

alter table public.attendance_log
  add constraint attendance_log_event_id_fkey foreign key (event_id) references public.events(id) on delete set null,
  add constraint attendance_log_shift_id_fkey foreign key (shift_id) references public.event_shifts(id) on delete set null;
create index if not exists event_shifts_event_date_idx on public.event_shifts(event_id,shift_date);
create index if not exists event_impact_metrics_event_idx on public.event_impact_metrics(event_id);
create index if not exists attendance_log_event_id_idx on public.attendance_log(event_id);
create index if not exists attendance_log_shift_id_idx on public.attendance_log(shift_id);

drop trigger if exists set_events_created_fields on public.events;
create trigger set_events_created_fields before insert on public.events for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_events_updated_fields on public.events;
create trigger set_events_updated_fields before update on public.events for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_event_shifts_created_fields on public.event_shifts;
create trigger set_event_shifts_created_fields before insert on public.event_shifts for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_event_shifts_updated_fields on public.event_shifts;
create trigger set_event_shifts_updated_fields before update on public.event_shifts for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_event_impact_metrics_created_fields on public.event_impact_metrics;
create trigger set_event_impact_metrics_created_fields before insert on public.event_impact_metrics for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_event_impact_metrics_updated_fields on public.event_impact_metrics;
create trigger set_event_impact_metrics_updated_fields before update on public.event_impact_metrics for each row execute function public.set_maklom_updated_fields();

drop trigger if exists audit_events_changes on public.events;
create trigger audit_events_changes after insert or update or delete on public.events for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_event_shifts_changes on public.event_shifts;
create trigger audit_event_shifts_changes after insert or update or delete on public.event_shifts for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_event_impact_metrics_changes on public.event_impact_metrics;
create trigger audit_event_impact_metrics_changes after insert or update or delete on public.event_impact_metrics for each row execute function maklom_private.log_maklom_change();

create or replace function maklom_private.validate_event_shift() returns trigger
language plpgsql security definer set search_path='' as $$
declare event_start date; event_end date;
begin
  select e.start_date,e.end_date into event_start,event_end from public.events e where e.id=new.event_id;
  if event_start is null then raise exception 'Event % not found',new.event_id; end if;
  if new.shift_date < event_start or new.shift_date > event_end then raise exception 'Shift date % is outside event range % to %',new.shift_date,event_start,event_end; end if;
  return new;
end; $$;
revoke all on function maklom_private.validate_event_shift() from public,anon,authenticated;
create trigger validate_event_shift_date before insert or update of event_id,shift_date on public.event_shifts for each row execute function maklom_private.validate_event_shift();

create or replace function maklom_private.sync_attendance_event_links() returns trigger
language plpgsql security definer set search_path='' as $$
declare shift_event_id text; shift_event_name text; linked_shift_date date; linked_event_name text;
begin
  if new.shift_id is not null then
    select s.event_id,e.name,s.shift_date into shift_event_id,shift_event_name,linked_shift_date
    from public.event_shifts s join public.events e on e.id=s.event_id where s.id=new.shift_id;
    if shift_event_id is null then raise exception 'Shift % not found',new.shift_id; end if;
    new.event_id=shift_event_id; new.event_name=shift_event_name; new.event_date=linked_shift_date;
  elsif new.event_id is not null then
    select e.name into linked_event_name from public.events e where e.id=new.event_id;
    if linked_event_name is null then raise exception 'Event % not found',new.event_id; end if;
    new.event_name=linked_event_name;
  end if;
  return new;
end; $$;
revoke all on function maklom_private.sync_attendance_event_links() from public,anon,authenticated;
create trigger sync_attendance_event_links before insert or update of event_id,shift_id,event_name,event_date on public.attendance_log for each row execute function maklom_private.sync_attendance_event_links();

create or replace function maklom_private.propagate_event_metadata() returns trigger
language plpgsql security definer set search_path='' as $$
begin if new.name is distinct from old.name then update public.attendance_log set event_name=new.name where event_id=new.id; end if; return new; end; $$;
revoke all on function maklom_private.propagate_event_metadata() from public,anon,authenticated;
create trigger propagate_event_metadata after update of name on public.events for each row execute function maklom_private.propagate_event_metadata();

create or replace function maklom_private.propagate_shift_metadata() returns trigger
language plpgsql security definer set search_path='' as $$
declare parent_name text;
begin
  select e.name into parent_name from public.events e where e.id=new.event_id;
  update public.attendance_log set event_id=new.event_id,event_name=parent_name,event_date=new.shift_date where shift_id=new.id;
  return new;
end; $$;
revoke all on function maklom_private.propagate_shift_metadata() from public,anon,authenticated;
create trigger propagate_shift_metadata after update of event_id,shift_date on public.event_shifts for each row execute function maklom_private.propagate_shift_metadata();

alter table public.events enable row level security;
alter table public.event_shifts enable row level security;
alter table public.event_impact_metrics enable row level security;
revoke all on public.events,public.event_shifts,public.event_impact_metrics from anon;
grant select,insert,update,delete on public.events,public.event_shifts,public.event_impact_metrics to authenticated,service_role;

create policy events_read_members on public.events for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy events_insert_editors on public.events for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy events_update_editors on public.events for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy events_delete_admins on public.events for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role='admin'));
create policy event_shifts_read_members on public.event_shifts for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy event_shifts_insert_editors on public.event_shifts for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy event_shifts_update_editors on public.event_shifts for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy event_shifts_delete_admins on public.event_shifts for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role='admin'));
create policy event_impact_metrics_read_members on public.event_impact_metrics for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy event_impact_metrics_insert_editors on public.event_impact_metrics for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy event_impact_metrics_update_editors on public.event_impact_metrics for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy event_impact_metrics_delete_admins on public.event_impact_metrics for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role='admin'));
