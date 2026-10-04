begin;

create table if not exists core.volunteer_onboarding_invites (
  id uuid primary key default gen_random_uuid(),
  volunteer_id uuid not null references core.volunteers(id) on delete cascade,
  auth_user_id uuid references auth.users(id) on delete set null,
  email_normalized text not null,
  status text not null default 'pending',
  invited_by uuid references core.user_accounts(id) on delete set null,
  invited_at timestamptz not null default now(),
  last_sent_at timestamptz,
  accepted_at timestamptz,
  revoked_at timestamptz,
  send_count integer not null default 0,
  last_error text,
  updated_at timestamptz not null default now(),
  constraint volunteer_onboarding_invites_email_check check (
    email_normalized = lower(btrim(email_normalized))
    and char_length(email_normalized) between 3 and 254
    and position('@' in email_normalized) > 1
  ),
  constraint volunteer_onboarding_invites_status_check check (
    status in ('pending', 'sent', 'accepted', 'revoked', 'failed')
  ),
  constraint volunteer_onboarding_invites_send_count_check check (send_count >= 0)
);

create unique index if not exists volunteer_onboarding_invites_active_volunteer_uidx
  on core.volunteer_onboarding_invites(volunteer_id)
  where status in ('pending', 'sent');

create unique index if not exists volunteer_onboarding_invites_active_auth_uidx
  on core.volunteer_onboarding_invites(auth_user_id)
  where auth_user_id is not null and status in ('pending', 'sent');

create index if not exists volunteer_onboarding_invites_email_idx
  on core.volunteer_onboarding_invites(email_normalized, invited_at desc);

create index if not exists volunteer_onboarding_invites_status_idx
  on core.volunteer_onboarding_invites(status, invited_at desc);

alter table core.volunteer_onboarding_invites enable row level security;

revoke all on table core.volunteer_onboarding_invites from public, anon, authenticated;
grant all on table core.volunteer_onboarding_invites to service_role;

comment on table core.volunteer_onboarding_invites is
  'Admin-created invitations that bind a verified Supabase Auth identity to a deliberately selected canonical KELUARGA volunteer.';

create or replace function audit.capture_volunteer_onboarding_invite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    perform audit.write_event(
      'volunteer_onboarding_invite.created',
      'volunteer_onboarding_invite',
      new.id::text,
      jsonb_build_object(
        'volunteer_id', new.volunteer_id,
        'auth_user_id', new.auth_user_id,
        'email', new.email_normalized,
        'status', new.status
      ),
      new.invited_by,
      null
    );
    return new;
  end if;

  if old.status is distinct from new.status
     or old.auth_user_id is distinct from new.auth_user_id
     or old.email_normalized is distinct from new.email_normalized
     or old.send_count is distinct from new.send_count then
    perform audit.write_event(
      'volunteer_onboarding_invite.updated',
      'volunteer_onboarding_invite',
      new.id::text,
      jsonb_build_object(
        'volunteer_id', new.volunteer_id,
        'auth_user_id', new.auth_user_id,
        'email', new.email_normalized,
        'from_status', old.status,
        'to_status', new.status,
        'send_count', new.send_count
      ),
      coalesce(new.invited_by, auth.uid()),
      null
    );
  end if;

  return new;
end;
$$;

drop trigger if exists volunteer_onboarding_invite_audit_trigger
  on core.volunteer_onboarding_invites;

create trigger volunteer_onboarding_invite_audit_trigger
after insert or update on core.volunteer_onboarding_invites
for each row execute function audit.capture_volunteer_onboarding_invite_change();

revoke all on function audit.capture_volunteer_onboarding_invite_change()
  from public, anon, authenticated;

create or replace function core.accept_current_volunteer_onboarding_invite()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_invite core.volunteer_onboarding_invites%rowtype;
  v_auth_email text;
  v_email_confirmed_at timestamptz;
  v_existing_volunteer_id uuid;
  v_target_auth_user_id uuid;
  v_target_name text;
begin
  if v_user_id is null then
    raise exception 'Authentication is required' using errcode = '42501';
  end if;

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
  into v_auth_email, v_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = v_user_id;

  if v_auth_email is null or v_email_confirmed_at is null then
    return 'email_unverified';
  end if;

  select invite.*
  into v_invite
  from core.volunteer_onboarding_invites invite
  where invite.auth_user_id = v_user_id
    and invite.status in ('pending', 'sent')
  order by invite.invited_at desc
  limit 1
  for update;

  if not found then return 'no_invite'; end if;

  if v_auth_email <> v_invite.email_normalized then
    update core.volunteer_onboarding_invites
    set status='failed', last_error='verified_email_does_not_match_invitation', updated_at=now()
    where id=v_invite.id;
    return 'email_mismatch';
  end if;

  if v_auth_email like '%@mendaki.org.sg' then
    update core.volunteer_onboarding_invites
    set status='failed', last_error='mendaki_work_email_reserved_for_staff', updated_at=now()
    where id=v_invite.id;
    return 'staff_access_required';
  end if;

  if exists (
    select 1 from core.user_roles role
    where role.user_id=v_user_id
      and role.role::text in ('volunteer_leader','staff','volteam','admin')
  ) then
    update core.volunteer_onboarding_invites
    set status='failed', last_error='staff_identity_cannot_be_linked_as_volunteer', updated_at=now()
    where id=v_invite.id;
    return 'staff_account';
  end if;

  select volunteer.id
  into v_existing_volunteer_id
  from core.volunteers volunteer
  where volunteer.auth_user_id=v_user_id
  limit 1
  for update;

  select volunteer.auth_user_id, volunteer.display_name
  into v_target_auth_user_id, v_target_name
  from core.volunteers volunteer
  where volunteer.id=v_invite.volunteer_id
  for update;

  if not found then
    update core.volunteer_onboarding_invites
    set status='failed', last_error='target_volunteer_not_found', updated_at=now()
    where id=v_invite.id;
    return 'target_missing';
  end if;

  if (v_target_auth_user_id is not null and v_target_auth_user_id <> v_user_id)
     or (v_existing_volunteer_id is not null and v_existing_volunteer_id <> v_invite.volunteer_id) then
    update core.volunteer_onboarding_invites
    set status='failed', last_error='auth_or_target_identity_conflict', updated_at=now()
    where id=v_invite.id;

    insert into core.account_link_cases(
      auth_user_id,status,reason_code,candidate_volunteer_id,submitted_for_review_at
    )
    select v_user_id,'needs_review','onboarding_invite_identity_conflict',v_invite.volunteer_id,now()
    where not exists (
      select 1 from core.account_link_cases review_case
      where review_case.auth_user_id=v_user_id
        and review_case.status in ('pending','needs_review')
    );

    return 'identity_conflict';
  end if;

  update core.volunteers
  set auth_user_id=v_user_id,
      primary_email_normalized=v_auth_email,
      account_access_eligible=true,
      updated_at=now()
  where id=v_invite.volunteer_id
    and (auth_user_id is null or auth_user_id=v_user_id);

  update core.user_accounts
  set status='active',
      display_name=coalesce(nullif(btrim(v_target_name),''),display_name),
      claimed_email_normalized=v_auth_email,
      email_ownership_verified=true,
      email_ownership_verified_at=coalesce(email_ownership_verified_at,v_email_confirmed_at,now()),
      updated_at=now()
  where id=v_user_id;

  insert into public.keluarga_volunteer_profiles(volunteer_id)
  values (v_invite.volunteer_id)
  on conflict (volunteer_id) do nothing;

  update public.phaseone_roster
  set volunteer_id=v_invite.volunteer_id
  where volunteer_id is null and email_normalized=v_auth_email;

  perform core.ensure_maklom_profile_extension(v_invite.volunteer_id,'keluarga_account');

  update core.account_link_cases
  set status='resolved',
      reason_code='resolved_by_admin_onboarding_invite',
      review_outcome='matched_existing_deferred',
      candidate_volunteer_id=v_invite.volunteer_id,
      requested_sections='{}'::text[],
      volunteer_message=null,
      resolution_notes=coalesce(
        resolution_notes,
        'Resolved after the invited email was verified and linked to the administrator-selected volunteer identity.'
      ),
      resolved_by=v_invite.invited_by,
      resolved_at=now()
  where auth_user_id=v_user_id
    and status in ('pending','needs_review');

  update core.volunteer_onboarding_invites
  set status='accepted',
      accepted_at=coalesce(accepted_at,now()),
      last_error=null,
      updated_at=now()
  where id=v_invite.id;

  perform audit.write_event(
    'volunteer.onboarding_invite_accepted',
    'volunteer',
    v_invite.volunteer_id::text,
    jsonb_build_object('invite_id',v_invite.id,'auth_user_id',v_user_id,'email',v_auth_email),
    v_user_id,
    null
  );

  if v_existing_volunteer_id=v_invite.volunteer_id then
    return 'already_linked';
  end if;

  return 'linked_existing';
end;
$$;

revoke all on function core.accept_current_volunteer_onboarding_invite()
  from public, anon;
grant execute on function core.accept_current_volunteer_onboarding_invite()
  to authenticated, service_role;

comment on function core.accept_current_volunteer_onboarding_invite() is
  'Accepts the current authenticated user''s active admin-created volunteer onboarding invitation after verified-email checks, linking that auth identity to the preselected canonical volunteer.';

commit;
