
create table if not exists core.volunteer_aliases (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete cascade,
  source_system text not null check (source_system in ('maklom_legacy', 'ymhub', 'external')),
  source_id text not null check (char_length(btrim(source_id)) between 1 and 256),
  created_at timestamptz not null default now(),
  created_by uuid references core.user_accounts(id) on delete set null,
  unique (source_system, source_id)
);

alter table core.volunteer_aliases enable row level security;
alter table core.volunteer_aliases force row level security;
revoke all on core.volunteer_aliases from public, anon, authenticated;
grant select, insert, update, delete on core.volunteer_aliases to service_role;

comment on table core.volunteer_aliases is
  'Cross-system aliases for the canonical core.volunteers UUID. Legacy MakLom IDs are retained here instead of becoming a second canonical person identity.';

alter table public.volunteers
  add column if not exists core_volunteer_id uuid;

alter table public.volunteers
  drop constraint if exists volunteers_core_volunteer_id_fkey;

alter table public.volunteers
  add constraint volunteers_core_volunteer_id_fkey
  foreign key (core_volunteer_id)
  references core.volunteers(id)
  on delete restrict;

with unique_maklom_email as (
  select lower(btrim(email)) as email_key, (array_agg(id order by id))[1] as maklom_id
  from public.volunteers
  where nullif(btrim(email), '') is not null
  group by lower(btrim(email))
  having count(*) = 1
),
unique_core_email as (
  select primary_email_normalized as email_key, (array_agg(id order by id::text))[1] as core_id
  from core.volunteers
  where primary_email_normalized is not null
  group by primary_email_normalized
  having count(*) = 1
)
update public.volunteers as maklom
set core_volunteer_id = core_match.core_id
from unique_maklom_email as maklom_match
join unique_core_email as core_match using (email_key)
where maklom.id = maklom_match.maklom_id
  and maklom.core_volunteer_id is null;

do $$
declare
  maklom_record record;
  canonical_id uuid;
  normalized_email text;
  email_count integer;
begin
  for maklom_record in
    select id, name, email, phone
    from public.volunteers
    where core_volunteer_id is null
    order by id
  loop
    normalized_email := nullif(lower(btrim(maklom_record.email)), '');

    if normalized_email is not null then
      select count(*)
      into email_count
      from public.volunteers
      where lower(btrim(email)) = normalized_email;

      if email_count <> 1
        or exists (
          select 1
          from core.volunteers
          where primary_email_normalized = normalized_email
        ) then
        normalized_email := null;
      end if;
    end if;

    insert into core.volunteers (
      display_name,
      primary_email_normalized,
      mobile,
      account_access_eligible
    ) values (
      nullif(btrim(maklom_record.name), ''),
      normalized_email,
      nullif(btrim(maklom_record.phone), ''),
      normalized_email is not null
    )
    returning id into canonical_id;

    update public.volunteers
    set core_volunteer_id = canonical_id
    where id = maklom_record.id;
  end loop;
end;
$$;

insert into core.volunteer_aliases (
  volunteer_id,
  source_system,
  source_id
)
select core_volunteer_id, 'maklom_legacy', id
from public.volunteers
where core_volunteer_id is not null
on conflict (source_system, source_id)
do update set volunteer_id = excluded.volunteer_id;

create unique index if not exists volunteers_core_volunteer_id_uidx
  on public.volunteers(core_volunteer_id)
  where core_volunteer_id is not null;

alter table public.volunteers
  alter column core_volunteer_id set not null;

comment on column public.volunteers.core_volunteer_id is
  'Canonical shared volunteer UUID from core.volunteers. public.volunteers is the MakLom-managed profile extension, not a second person identity.';

alter table public.events
  add column if not exists keluarga_event_id uuid references public.phaseone_events(id) on delete set null;

create unique index if not exists events_keluarga_event_id_uidx
  on public.events(keluarga_event_id)
  where keluarga_event_id is not null;

comment on column public.events.keluarga_event_id is
  'Optional link from a legacy MakLom event record to the canonical KELUARGA programme/event. New operational events are owned by KELUARGA.';
comment on table public.events is
  'MakLom legacy/historical event records. New programme and Event Operations records are owned by public.phaseone_events; use keluarga_event_id when a MakLom record must reference one.';
comment on table public.attendance_log is
  'MakLom legacy/imported attendance ledger. New KELUARGA operational attendance is captured in phaseone attendance/session tables and promoted to reviewed contribution records.';
comment on table public.form_submissions is
  'MakLom attendance-form import rows only. Do not use this table for volunteer recruitment leads.';
comment on table public.keluarga_recruitment_applications is
  'Retired KELUARGA recruitment workflow retained for historical provenance. New prospective-volunteer intake comes from FormSG into public.volunteer_leads.';

create table if not exists public.volunteer_leads (
  id uuid primary key default gen_random_uuid(),
  source text not null default 'formsg' check (source in ('formsg', 'manual')),
  source_form_id text,
  source_response_id text,
  submitted_at timestamptz not null default now(),
  full_name text not null check (char_length(btrim(full_name)) between 1 and 160),
  email text,
  phone text,
  interest_area text,
  notes text,
  raw_payload jsonb not null default '{}'::jsonb check (jsonb_typeof(raw_payload) = 'object'),
  status text not null default 'new' check (status in ('new', 'contacted', 'qualified', 'converted', 'closed')),
  converted_volunteer_id uuid references core.volunteers(id) on delete restrict,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null default auth.uid(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null default auth.uid(),
  constraint volunteer_leads_conversion_consistency check (
    (status = 'converted' and converted_volunteer_id is not null)
    or status <> 'converted'
  )
);

create unique index if not exists volunteer_leads_formsg_response_uidx
  on public.volunteer_leads(source, source_form_id, source_response_id)
  where source_response_id is not null;
create index if not exists volunteer_leads_status_submitted_idx
  on public.volunteer_leads(status, submitted_at desc);
create index if not exists volunteer_leads_email_idx
  on public.volunteer_leads(lower(btrim(email)))
  where email is not null;

create table if not exists public.volunteer_lead_status_history (
  id bigint generated always as identity primary key,
  lead_id uuid not null references public.volunteer_leads(id) on delete cascade,
  old_status text,
  new_status text not null,
  changed_by uuid references auth.users(id) on delete set null,
  changed_at timestamptz not null default now(),
  note text
);

create or replace function public.set_volunteer_lead_updated_fields()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if new.status is distinct from old.status then
    new.reviewed_at := now();
    new.reviewed_by := auth.uid();
  end if;
  return new;
end;
$$;

drop trigger if exists volunteer_leads_set_updated_fields on public.volunteer_leads;
create trigger volunteer_leads_set_updated_fields
before update on public.volunteer_leads
for each row execute function public.set_volunteer_lead_updated_fields();

create or replace function public.track_volunteer_lead_status()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  insert into public.volunteer_lead_status_history (
    lead_id, old_status, new_status, changed_by
  ) values (
    new.id,
    case when tg_op = 'INSERT' then null else old.status end,
    new.status,
    auth.uid()
  );
  return null;
end;
$$;

drop trigger if exists volunteer_leads_track_status on public.volunteer_leads;
create trigger volunteer_leads_track_status
after insert or update of status on public.volunteer_leads
for each row execute function public.track_volunteer_lead_status();

alter table public.volunteer_leads enable row level security;
alter table public.volunteer_lead_status_history enable row level security;

create policy volunteer_leads_read_members
on public.volunteer_leads for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));
create policy volunteer_leads_insert_editors
on public.volunteer_leads for insert to authenticated
with check (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
));
create policy volunteer_leads_update_editors
on public.volunteer_leads for update to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
))
with check (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role in ('editor','admin')
));
create policy volunteer_leads_delete_admins
on public.volunteer_leads for delete to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active and m.role = 'admin'
));
create policy volunteer_lead_history_read_members
on public.volunteer_lead_status_history for select to authenticated
using (exists (
  select 1 from public.app_members m
  where m.user_id = (select auth.uid()) and m.active
));

grant select, insert, update, delete on public.volunteer_leads to authenticated, service_role;
grant select on public.volunteer_lead_status_history to authenticated, service_role;
grant insert on public.volunteer_lead_status_history to service_role;
grant usage, select on sequence public.volunteer_lead_status_history_id_seq to service_role;

create or replace view public.maklom_volunteer_identity
with (security_invoker = true)
as
select
  maklom.id as maklom_legacy_id,
  maklom.core_volunteer_id as volunteer_id,
  core.volunteer_code,
  maklom.name as managed_name,
  core.display_name as keluarga_display_name,
  maklom.email as managed_email,
  core.primary_email_normalized as keluarga_email,
  maklom.phone as managed_phone,
  core.mobile as keluarga_mobile
from public.volunteers maklom
join core.volunteers core on core.id = maklom.core_volunteer_id;

grant select on public.maklom_volunteer_identity to authenticated, service_role;
