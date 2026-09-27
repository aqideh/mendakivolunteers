
create table if not exists public.app_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'viewer' check (role in ('viewer','editor','admin')),
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.volunteers (
  id text primary key,
  name text not null,
  nric text,
  phone text,
  email text,
  gender text,
  address text,
  recruited_year smallint,
  chat_session text,
  chat_session_date date,
  interests text,
  languages_spoken text,
  programmes_registered text[] not null default '{}',
  tags text[] not null default '{}',
  emergency_name text,
  emergency_phone text,
  shirt_size text,
  dietary text,
  notes text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  row_version bigint not null default 1 check (row_version >= 1),
  check (recruited_year is null or recruited_year between 1900 and 2100),
  check (coalesce(nullif(btrim(phone),''), nullif(btrim(email),'')) is not null)
);
create unique index if not exists volunteers_nric_unique_not_blank on public.volunteers (upper(nric)) where nric is not null and btrim(nric) <> '';
create index if not exists volunteers_email_idx on public.volunteers (lower(email));
create index if not exists volunteers_phone_idx on public.volunteers (phone);
create index if not exists volunteers_recruited_year_idx on public.volunteers (recruited_year);
create index if not exists volunteers_tags_gin_idx on public.volunteers using gin (tags);
create index if not exists volunteers_programmes_gin_idx on public.volunteers using gin (programmes_registered);
create index if not exists volunteers_created_by_idx on public.volunteers (created_by);
create index if not exists volunteers_updated_by_idx on public.volunteers (updated_by);

create table if not exists public.attendance_log (
  id text primary key,
  volunteer_id text references public.volunteers(id) on delete set null,
  name text not null,
  email text,
  contact text,
  attended boolean not null default false,
  event_name text not null,
  event_date date not null,
  duration_minutes integer not null default 0 check (duration_minutes between 0 and 6059),
  grab_voucher_code_1 text,
  grab_voucher_code_2 text,
  grab_voucher_code_3 text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  row_version bigint not null default 1 check (row_version >= 1),
  sign_in_at timestamptz,
  sign_out_at timestamptz,
  calculated_duration_minutes integer check (calculated_duration_minutes is null or calculated_duration_minutes >= 0),
  staff_credited_duration_minutes integer check (staff_credited_duration_minutes is null or staff_credited_duration_minutes >= 0),
  staff_credit_note text,
  form_reconciliation_id text,
  event_id text,
  shift_id text,
  shift_label text check (shift_label is null or char_length(shift_label) <= 120),
  check (coalesce(nullif(btrim(contact),''), nullif(btrim(email),'')) is not null)
);
create index if not exists attendance_log_volunteer_id_idx on public.attendance_log (volunteer_id);
create index if not exists attendance_log_event_date_idx on public.attendance_log (event_date);
create index if not exists attendance_log_event_name_idx on public.attendance_log (event_name);
create index if not exists attendance_log_email_idx on public.attendance_log (lower(email));
create index if not exists attendance_log_contact_idx on public.attendance_log (contact);
create index if not exists attendance_log_created_by_idx on public.attendance_log (created_by);
create index if not exists attendance_log_updated_by_idx on public.attendance_log (updated_by);

create table if not exists public.reporting_metrics (
  id text primary key,
  label text not null,
  value bigint check (value is null or value >= 0),
  note text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  row_version bigint not null default 1 check (row_version >= 1)
);

create table if not exists public.suspected_duplicates (
  id text primary key,
  level text not null check (level in ('medium','low')),
  existing_volunteer_id text references public.volunteers(id) on delete cascade,
  incoming jsonb not null,
  decision text not null default 'pending' check (decision in ('pending','merge','add','dismiss')),
  reason text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  row_version bigint not null default 1 check (row_version >= 1)
);
create index if not exists suspected_duplicates_existing_idx on public.suspected_duplicates (existing_volunteer_id);
create index if not exists suspected_duplicates_decision_idx on public.suspected_duplicates (decision);

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  actor_user_id uuid references auth.users(id) on delete set null,
  entity_type text not null,
  entity_id text,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now()
);
create index if not exists audit_log_occurred_at_idx on public.audit_log (occurred_at desc);
create index if not exists audit_log_entity_idx on public.audit_log (entity_type, entity_id);
create index if not exists audit_log_actor_user_id_idx on public.audit_log (actor_user_id);

create table if not exists public.merge_log (
  id text primary key,
  occurred_at timestamptz not null default now(),
  level text,
  action text not null,
  existing_name text,
  incoming_name text,
  reason text,
  created_by uuid references auth.users(id) on delete set null default auth.uid()
);

create or replace function public.set_maklom_created_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  new.created_at=now(); new.created_by=auth.uid(); new.updated_at=now(); new.updated_by=auth.uid(); new.row_version=1; return new;
end; $$;
revoke all on function public.set_maklom_created_fields() from public;

create or replace function public.set_maklom_updated_fields()
returns trigger language plpgsql set search_path='' as $$
begin
  new.created_at=old.created_at; new.created_by=old.created_by; new.updated_at=now(); new.updated_by=auth.uid(); new.row_version=old.row_version+1; return new;
end; $$;
revoke all on function public.set_maklom_updated_fields() from public;

create or replace function public.set_maklom_member_updated_at()
returns trigger language plpgsql set search_path='' as $$
begin new.updated_at=now(); return new; end; $$;
revoke all on function public.set_maklom_member_updated_at() from public;

create or replace function public.set_merge_log_created_by()
returns trigger language plpgsql set search_path='' as $$
begin new.created_by=auth.uid(); if new.occurred_at is null then new.occurred_at=now(); end if; return new; end; $$;
revoke all on function public.set_merge_log_created_by() from public;

create schema if not exists maklom_private authorization postgres;
revoke all on schema maklom_private from public,anon,authenticated;
create or replace function maklom_private.log_maklom_change()
returns trigger language plpgsql security definer set search_path='' as $$
declare record_id text; version_value text;
begin
  if tg_table_schema <> 'public' or tg_table_name not in ('volunteers','attendance_log','reporting_metrics','suspected_duplicates','merge_log','form_import_batches','form_submissions','attendance_reconciliations','events','event_shifts','event_impact_metrics') then
    raise exception 'MakLom audit trigger invoked from unexpected relation %.%',tg_table_schema,tg_table_name;
  end if;
  if tg_op='DELETE' then record_id=old.id; version_value=to_jsonb(old)->>'row_version'; else record_id=new.id; version_value=to_jsonb(new)->>'row_version'; end if;
  insert into public.audit_log(actor_user_id,entity_type,entity_id,action,details)
  values(auth.uid(),tg_table_name,record_id,lower(tg_op),jsonb_strip_nulls(jsonb_build_object('source','database-trigger','row_version',version_value)));
  if tg_op='DELETE' then return old; end if; return new;
end; $$;
revoke all on function maklom_private.log_maklom_change() from public,anon,authenticated;

drop trigger if exists set_app_members_updated_at on public.app_members;
create trigger set_app_members_updated_at before update on public.app_members for each row execute function public.set_maklom_member_updated_at();
drop trigger if exists set_volunteers_created_fields on public.volunteers;
create trigger set_volunteers_created_fields before insert on public.volunteers for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_volunteers_updated_fields on public.volunteers;
create trigger set_volunteers_updated_fields before update on public.volunteers for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_attendance_log_created_fields on public.attendance_log;
create trigger set_attendance_log_created_fields before insert on public.attendance_log for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_attendance_log_updated_fields on public.attendance_log;
create trigger set_attendance_log_updated_fields before update on public.attendance_log for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_reporting_metrics_created_fields on public.reporting_metrics;
create trigger set_reporting_metrics_created_fields before insert on public.reporting_metrics for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_reporting_metrics_updated_fields on public.reporting_metrics;
create trigger set_reporting_metrics_updated_fields before update on public.reporting_metrics for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_suspected_duplicates_created_fields on public.suspected_duplicates;
create trigger set_suspected_duplicates_created_fields before insert on public.suspected_duplicates for each row execute function public.set_maklom_created_fields();
drop trigger if exists set_suspected_duplicates_updated_fields on public.suspected_duplicates;
create trigger set_suspected_duplicates_updated_fields before update on public.suspected_duplicates for each row execute function public.set_maklom_updated_fields();
drop trigger if exists set_merge_log_created_by on public.merge_log;
create trigger set_merge_log_created_by before insert on public.merge_log for each row execute function public.set_merge_log_created_by();

drop trigger if exists audit_volunteers_changes on public.volunteers;
create trigger audit_volunteers_changes after insert or update or delete on public.volunteers for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_attendance_log_changes on public.attendance_log;
create trigger audit_attendance_log_changes after insert or update or delete on public.attendance_log for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_reporting_metrics_changes on public.reporting_metrics;
create trigger audit_reporting_metrics_changes after insert or update or delete on public.reporting_metrics for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_suspected_duplicates_changes on public.suspected_duplicates;
create trigger audit_suspected_duplicates_changes after insert or update or delete on public.suspected_duplicates for each row execute function maklom_private.log_maklom_change();
drop trigger if exists audit_merge_log_changes on public.merge_log;
create trigger audit_merge_log_changes after insert or update or delete on public.merge_log for each row execute function maklom_private.log_maklom_change();

alter table public.app_members enable row level security;
alter table public.volunteers enable row level security;
alter table public.attendance_log enable row level security;
alter table public.reporting_metrics enable row level security;
alter table public.suspected_duplicates enable row level security;
alter table public.audit_log enable row level security;
alter table public.merge_log enable row level security;

create policy app_members_read_self on public.app_members for select to authenticated using (user_id=(select auth.uid()));
create policy volunteers_read_members on public.volunteers for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy volunteers_insert_editors on public.volunteers for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy volunteers_update_editors on public.volunteers for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy volunteers_delete_editors on public.volunteers for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy attendance_log_read_members on public.attendance_log for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy attendance_log_insert_editors on public.attendance_log for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy attendance_log_update_editors on public.attendance_log for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy attendance_log_delete_editors on public.attendance_log for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy reporting_metrics_read_members on public.reporting_metrics for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy reporting_metrics_insert_editors on public.reporting_metrics for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy reporting_metrics_update_editors on public.reporting_metrics for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy reporting_metrics_delete_editors on public.reporting_metrics for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy suspected_duplicates_read_members on public.suspected_duplicates for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy suspected_duplicates_insert_editors on public.suspected_duplicates for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy suspected_duplicates_update_editors on public.suspected_duplicates for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy suspected_duplicates_delete_editors on public.suspected_duplicates for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy audit_log_read_members on public.audit_log for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy merge_log_read_members on public.merge_log for select to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active));
create policy merge_log_insert_editors on public.merge_log for insert to authenticated with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy merge_log_update_editors on public.merge_log for update to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text]))) with check (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role=any(array['editor'::text,'admin'::text])));
create policy merge_log_delete_admins on public.merge_log for delete to authenticated using (exists(select 1 from public.app_members m where m.user_id=(select auth.uid()) and m.active and m.role='admin'));

revoke all on public.app_members,public.volunteers,public.attendance_log,public.reporting_metrics,public.suspected_duplicates,public.audit_log,public.merge_log from anon;
grant select on public.app_members to authenticated;
grant select,insert,update,delete on public.volunteers,public.attendance_log,public.reporting_metrics,public.suspected_duplicates,public.merge_log to authenticated,service_role;
grant select on public.audit_log to authenticated,service_role;
