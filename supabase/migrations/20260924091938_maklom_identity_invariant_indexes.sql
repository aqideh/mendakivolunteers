
create index if not exists volunteer_aliases_volunteer_idx
  on core.volunteer_aliases(volunteer_id);
create index if not exists volunteer_aliases_created_by_idx
  on core.volunteer_aliases(created_by)
  where created_by is not null;
create index if not exists maklom_profile_inbox_event_idx
  on public.maklom_profile_inbox(event_id);
create index if not exists maklom_profile_inbox_reviewed_by_idx
  on public.maklom_profile_inbox(reviewed_by)
  where reviewed_by is not null;
create index if not exists volunteer_lead_history_lead_idx
  on public.volunteer_lead_status_history(lead_id);
create index if not exists volunteer_contribution_audit_contribution_idx
  on public.volunteer_contribution_audit(contribution_id);

create or replace function core.ensure_maklom_profile_identity()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, core
as $$
declare
  normalized_email text;
  matching_core_id uuid;
  core_match_count integer;
begin
  if new.core_volunteer_id is not null then
    return new;
  end if;

  normalized_email := nullif(lower(btrim(new.email)), '');

  if normalized_email is not null then
    select count(*), (array_agg(v.id order by v.id::text))[1]
    into core_match_count, matching_core_id
    from core.volunteers v
    where v.primary_email_normalized = normalized_email;

    if core_match_count = 1
       and not exists (
         select 1
         from public.volunteers p
         where p.core_volunteer_id = matching_core_id
       ) then
      new.core_volunteer_id := matching_core_id;
      return new;
    end if;

    if core_match_count > 0 then
      normalized_email := null;
    end if;
  end if;

  insert into core.volunteers (
    display_name,
    primary_email_normalized,
    mobile,
    account_access_eligible
  ) values (
    nullif(btrim(new.name), ''),
    normalized_email,
    nullif(btrim(new.phone), ''),
    normalized_email is not null
  )
  returning id into new.core_volunteer_id;

  return new;
end;
$$;

revoke all on function core.ensure_maklom_profile_identity()
  from public, anon, authenticated;

drop trigger if exists volunteers_ensure_canonical_identity on public.volunteers;
create trigger volunteers_ensure_canonical_identity
before insert on public.volunteers
for each row execute function core.ensure_maklom_profile_identity();

create or replace function core.ensure_maklom_profile_alias()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, core
as $$
begin
  insert into core.volunteer_aliases (
    volunteer_id,
    source_system,
    source_id
  ) values (
    new.core_volunteer_id,
    'maklom_legacy',
    new.id
  )
  on conflict (source_system, source_id)
  do update set volunteer_id = excluded.volunteer_id;

  return null;
end;
$$;

revoke all on function core.ensure_maklom_profile_alias()
  from public, anon, authenticated;

drop trigger if exists volunteers_ensure_legacy_alias on public.volunteers;
create trigger volunteers_ensure_legacy_alias
after insert or update of core_volunteer_id on public.volunteers
for each row execute function core.ensure_maklom_profile_alias();

comment on function core.ensure_maklom_profile_identity() is
  'Enforces the shared identity invariant for new MakLom profiles. It may reuse exactly one unclaimed canonical volunteer matched by normalized email; otherwise it creates a new core.volunteers row. Email is never the permanent identity key.';
comment on function core.ensure_maklom_profile_alias() is
  'Ensures each MakLom legacy profile ID is retained as an alias of the canonical core.volunteers UUID.';
