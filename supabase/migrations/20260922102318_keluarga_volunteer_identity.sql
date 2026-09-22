create sequence if not exists core.volunteer_code_seq
  as bigint
  increment by 1
  minvalue 1
  maxvalue 99999
  start with 1
  no cycle;

revoke all on sequence core.volunteer_code_seq from public, anon, authenticated;
grant usage, select on sequence core.volunteer_code_seq to service_role;

create or replace function core.next_volunteer_code()
returns text
language sql
volatile
security invoker
set search_path = pg_catalog, core
as $$
  select 'KEL' || lpad(nextval('core.volunteer_code_seq'::regclass)::text, 5, '0');
$$;

revoke all on function core.next_volunteer_code() from public, anon, authenticated;
grant execute on function core.next_volunteer_code() to service_role;

alter table core.volunteers
  add column if not exists volunteer_code text;

update core.volunteers
set volunteer_code = core.next_volunteer_code()
where volunteer_code is null;

alter table core.volunteers
  alter column volunteer_code set default core.next_volunteer_code(),
  alter column volunteer_code set not null,
  alter column ymhub_volunteer_id drop not null;

alter table core.volunteers
  drop constraint if exists volunteers_volunteer_code_format,
  drop constraint if exists volunteers_volunteer_code_key;

alter table core.volunteers
  add constraint volunteers_volunteer_code_format check (
    volunteer_code ~ '^KEL[0-9]{5}$'
    and volunteer_code <> 'KEL00000'
  ),
  add constraint volunteers_volunteer_code_key unique (volunteer_code);

create or replace function core.prevent_volunteer_code_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.volunteer_code is distinct from new.volunteer_code then
    raise exception 'KELUARGA volunteer ID is immutable'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

revoke all on function core.prevent_volunteer_code_change()
  from public, anon, authenticated;

drop trigger if exists volunteers_prevent_volunteer_code_change on core.volunteers;
create trigger volunteers_prevent_volunteer_code_change
before update of volunteer_code on core.volunteers
for each row execute function core.prevent_volunteer_code_change();

create or replace function core.prevent_ymhub_volunteer_id_change()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog
as $$
begin
  if old.ymhub_volunteer_id is not null
     and old.ymhub_volunteer_id is distinct from new.ymhub_volunteer_id then
    raise exception 'YM Hub volunteer ID is immutable once assigned'
      using errcode = 'P0001';
  end if;

  return new;
end;
$$;

comment on column core.volunteers.volunteer_code is
  'Immutable human-readable KELUARGA volunteer identifier in KEL00001 format. KEL00000 is reserved.';
comment on column core.volunteers.ymhub_volunteer_id is
  'Optional YM Hub backend reconciliation identifier. It may be assigned once after a KELUARGA volunteer is handed off to YM Hub.';
comment on column core.volunteers.display_name is
  'KELUARGA volunteer display name. Backend reconciliation may enrich this value but does not define volunteer identity.';
comment on column core.volunteers.primary_email_normalized is
  'Lowercase volunteer contact email used for account matching and communications. It is not the permanent volunteer identifier.';
comment on column core.volunteers.account_access_eligible is
  'Legacy eligibility flag retained for imported-account matching during transition; KELUARGA-native volunteer identity does not depend on it.';
