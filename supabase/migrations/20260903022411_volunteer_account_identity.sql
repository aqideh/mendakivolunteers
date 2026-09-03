begin;

create schema if not exists gamification;

comment on schema gamification is
  'KELUARGA-owned, auditable points derived from authoritative YM Hub records.';

revoke all on schema gamification from public, anon, authenticated;
grant usage on schema gamification to service_role;

alter table core.volunteers
  add column if not exists display_name text,
  add column if not exists primary_email_normalized text,
  add column if not exists account_access_eligible boolean not null default false;

alter table core.volunteers
  drop constraint if exists volunteers_display_name_length,
  drop constraint if exists volunteers_primary_email_normalized_format;

alter table core.volunteers
  add constraint volunteers_display_name_length check (
    display_name is null or char_length(display_name) between 1 and 120
  ),
  add constraint volunteers_primary_email_normalized_format check (
    primary_email_normalized is null
    or (
      primary_email_normalized = lower(btrim(primary_email_normalized))
      and char_length(primary_email_normalized) between 3 and 254
      and primary_email_normalized like '%@%'
    )
  );

create index if not exists volunteers_eligible_email_idx
  on core.volunteers (primary_email_normalized)
  where account_access_eligible and primary_email_normalized is not null;

comment on column core.volunteers.display_name is
  'Authoritative volunteer display name imported from YM Hub for account matching and presentation.';
comment on column core.volunteers.primary_email_normalized is
  'Lowercase authoritative email used only as a verified account-linking key; the YM Hub volunteer ID remains canonical.';
comment on column core.volunteers.account_access_eligible is
  'True only when an approved YM Hub import permits this volunteer record to provision or link a KELUARGA account.';

create or replace function core.link_current_account_by_verified_email()
returns text
language plpgsql
security definer
set search_path = pg_catalog, core, auth, audit
as $$
declare
  current_user_id uuid := auth.uid();
  verified_email text;
  current_status core.account_status;
  candidate_count integer;
  existing_volunteer_id uuid;
  existing_volunteer_name text;
  candidate_id uuid;
  candidate_name text;
  candidate_ymhub_volunteer_id text;
  candidate_linked_user uuid;
begin
  if current_user_id is null then
    raise exception 'Authentication is required'
      using errcode = '42501';
  end if;

  select accounts.status
  into current_status
  from core.user_accounts as accounts
  where accounts.id = current_user_id;

  if current_status is null then
    raise exception 'KELUARGA account is unavailable'
      using errcode = '42501';
  end if;

  if current_status in ('suspended', 'closed') then
    return 'account_inactive';
  end if;

  select volunteers.id, volunteers.display_name
  into existing_volunteer_id, existing_volunteer_name
  from core.volunteers as volunteers
  where volunteers.auth_user_id = current_user_id
  limit 1;

  if existing_volunteer_id is not null then
    update core.user_accounts
    set
      status = 'active',
      display_name = coalesce(
        nullif(btrim(existing_volunteer_name), ''),
        display_name
      )
    where id = current_user_id;

    return 'already_linked';
  end if;

  select lower(btrim(users.email))
  into verified_email
  from auth.users as users
  where users.id = current_user_id
    and users.email is not null
    and coalesce(users.email_confirmed_at, users.confirmed_at) is not null;

  if verified_email is null then
    return 'email_unverified';
  end if;

  select count(*)::integer
  into candidate_count
  from core.volunteers as volunteers
  where volunteers.primary_email_normalized = verified_email
    and volunteers.account_access_eligible;

  if candidate_count = 0 then
    return 'no_match';
  end if;

  if candidate_count > 1 then
    insert into core.account_link_cases (
      auth_user_id,
      status,
      reason_code
    )
    select
      current_user_id,
      'needs_review',
      'ambiguous_verified_email'
    where not exists (
      select 1
      from core.account_link_cases as cases
      where cases.auth_user_id = current_user_id
        and cases.status in ('pending', 'needs_review')
    )
    on conflict do nothing;

    return 'needs_review';
  end if;

  select
    volunteers.id,
    volunteers.display_name,
    volunteers.ymhub_volunteer_id,
    volunteers.auth_user_id
  into
    candidate_id,
    candidate_name,
    candidate_ymhub_volunteer_id,
    candidate_linked_user
  from core.volunteers as volunteers
  where volunteers.primary_email_normalized = verified_email
    and volunteers.account_access_eligible
  limit 1;

  if candidate_linked_user is not null
    and candidate_linked_user <> current_user_id then
    insert into core.account_link_cases (
      auth_user_id,
      candidate_ymhub_volunteer_id,
      status,
      reason_code
    )
    select
      current_user_id,
      candidate_ymhub_volunteer_id,
      'needs_review',
      'verified_email_already_linked'
    where not exists (
      select 1
      from core.account_link_cases as cases
      where cases.auth_user_id = current_user_id
        and cases.status in ('pending', 'needs_review')
    )
    on conflict do nothing;

    return 'needs_review';
  end if;

  if candidate_linked_user is null then
    update core.volunteers
    set auth_user_id = current_user_id
    where id = candidate_id
      and auth_user_id is null;

    if not found then
      insert into core.account_link_cases (
        auth_user_id,
        status,
        reason_code
      ) values (
        current_user_id,
        'needs_review',
        'verified_email_already_linked'
      )
      on conflict do nothing;

      return 'needs_review';
    end if;
  end if;

  update core.user_accounts
  set
    status = 'active',
    display_name = coalesce(nullif(btrim(candidate_name), ''), display_name)
  where id = current_user_id;

  update core.account_link_cases
  set
    status = 'resolved',
    resolution_notes = 'Automatically resolved after a unique verified-email match.',
    resolved_by = current_user_id,
    resolved_at = now()
  where auth_user_id = current_user_id
    and status in ('pending', 'needs_review');

  if candidate_linked_user = current_user_id then
    return 'already_linked';
  end if;

  return 'linked';
end;
$$;

comment on function core.link_current_account_by_verified_email() is
  'Links the authenticated KELUARGA account to exactly one approved YM Hub volunteer projection sharing its verified email.';

revoke all on function core.link_current_account_by_verified_email()
  from public, anon, authenticated;
grant execute on function core.link_current_account_by_verified_email()
  to authenticated, service_role;

commit;
