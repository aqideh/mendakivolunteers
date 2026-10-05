begin;

alter table core.volunteer_onboarding_invites
  add column if not exists token_hash text,
  add column if not exists expires_at timestamptz,
  add column if not exists redemption_nonce uuid,
  add column if not exists redemption_started_at timestamptz,
  add column if not exists verification_attempts integer not null default 0,
  add column if not exists locked_until timestamptz;

alter table core.volunteer_onboarding_invites
  drop constraint if exists volunteer_onboarding_invites_status_check;

alter table core.volunteer_onboarding_invites
  add constraint volunteer_onboarding_invites_status_check
  check (status in ('pending', 'sent', 'redeeming', 'accepted', 'revoked', 'failed'));

alter table core.volunteer_onboarding_invites
  drop constraint if exists volunteer_onboarding_invites_token_hash_check;

alter table core.volunteer_onboarding_invites
  add constraint volunteer_onboarding_invites_token_hash_check
  check (token_hash is null or char_length(token_hash) = 64);

alter table core.volunteer_onboarding_invites
  drop constraint if exists volunteer_onboarding_invites_verification_attempts_check;

alter table core.volunteer_onboarding_invites
  add constraint volunteer_onboarding_invites_verification_attempts_check
  check (verification_attempts >= 0);

drop index if exists core.volunteer_onboarding_invites_active_volunteer_uidx;
drop index if exists core.volunteer_onboarding_invites_active_auth_uidx;

create unique index volunteer_onboarding_invites_active_volunteer_uidx
  on core.volunteer_onboarding_invites(volunteer_id)
  where status in ('pending', 'sent', 'redeeming');

create unique index volunteer_onboarding_invites_active_auth_uidx
  on core.volunteer_onboarding_invites(auth_user_id)
  where auth_user_id is not null and status in ('pending', 'sent', 'redeeming');

create unique index if not exists volunteer_onboarding_invites_active_email_uidx
  on core.volunteer_onboarding_invites(email_normalized)
  where status in ('pending', 'sent', 'redeeming');

create unique index if not exists volunteer_onboarding_invites_token_hash_uidx
  on core.volunteer_onboarding_invites(token_hash)
  where token_hash is not null;

create table if not exists core.volunteer_onboarding_redemption_contexts (
  id uuid primary key default gen_random_uuid(),
  invite_id uuid not null
    references core.volunteer_onboarding_invites(id) on delete cascade,
  context_hash text not null unique,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  constraint volunteer_onboarding_redemption_contexts_hash_check
    check (char_length(context_hash) = 64),
  constraint volunteer_onboarding_redemption_contexts_expiry_check
    check (expires_at > created_at)
);

create index if not exists volunteer_onboarding_redemption_contexts_invite_idx
  on core.volunteer_onboarding_redemption_contexts(invite_id, created_at desc);

create index if not exists volunteer_onboarding_redemption_contexts_expiry_idx
  on core.volunteer_onboarding_redemption_contexts(expires_at);

alter table core.volunteer_onboarding_redemption_contexts enable row level security;

revoke all on table core.volunteer_onboarding_redemption_contexts
  from public, anon, authenticated;
grant all on table core.volunteer_onboarding_redemption_contexts
  to service_role;

comment on table core.volunteer_onboarding_redemption_contexts is
  'Short-lived server-side contexts created after a seven-day onboarding token is opened. Raw context secrets remain only in HttpOnly cookies.';

create or replace function core.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'core', 'audit'
as $function$
declare
  claimed_email text := case
    when new.email is null then null
    else lower(btrim(new.email))
  end;
  email_is_verified boolean :=
    new.email is not null
    and new.email_confirmed_at is not null
    and coalesce(
      new.raw_app_meta_data ->> 'keluarga_email_ownership_verified',
      'true'
    ) <> 'false';
begin
  if coalesce(new.raw_app_meta_data ->> 'keluarga_transport_only', 'false') = 'true' then
    return new;
  end if;

  insert into core.user_accounts (
    id,
    display_name,
    claimed_email_normalized,
    email_ownership_verified,
    email_ownership_verified_at
  )
  values (
    new.id,
    nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), ''),
    claimed_email,
    email_is_verified,
    case when email_is_verified then coalesce(new.email_confirmed_at, now()) end
  )
  on conflict (id) do update
  set
    claimed_email_normalized = coalesce(
      excluded.claimed_email_normalized,
      core.user_accounts.claimed_email_normalized
    ),
    email_ownership_verified = (
      core.user_accounts.email_ownership_verified
      or excluded.email_ownership_verified
    ),
    email_ownership_verified_at = case
      when core.user_accounts.email_ownership_verified_at is not null
        then core.user_accounts.email_ownership_verified_at
      when excluded.email_ownership_verified
        then excluded.email_ownership_verified_at
      else null
    end;

  insert into core.user_roles (user_id, role, reason)
  values (new.id, 'volunteer', 'Default role assigned at account creation')
  on conflict (user_id, role) do nothing;

  perform audit.write_event(
    'account.created',
    'user_account',
    new.id::text,
    jsonb_build_object(
      'default_role', 'volunteer',
      'email_ownership_verified', email_is_verified
    ),
    new.id,
    null
  );

  return new;
end;
$function$;

revoke all on function core.handle_new_auth_user()
  from public, anon, authenticated;

create or replace function core.begin_volunteer_onboarding_redemption(
  p_context_hash text,
  p_mobile text,
  p_redemption_nonce uuid
)
returns table (
  result text,
  invite_id uuid,
  volunteer_id uuid,
  email_normalized text,
  auth_user_id uuid,
  display_name text
)
language plpgsql
security invoker
set search_path = ''
as $function$
declare
  v_context core.volunteer_onboarding_redemption_contexts%rowtype;
  v_invite core.volunteer_onboarding_invites%rowtype;
  v_mobile text;
  v_name text;
  v_expected_mobile text;
  v_provided_mobile text;
  v_attempts integer;
begin
  if p_context_hash is null
     or char_length(p_context_hash) <> 64
     or p_redemption_nonce is null then
    return query
      select 'invalid'::text, null::uuid, null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  select context_row.*
  into v_context
  from core.volunteer_onboarding_redemption_contexts context_row
  where context_row.context_hash = p_context_hash
  for update;

  if not found
     or v_context.consumed_at is not null
     or v_context.expires_at <= now() then
    return query
      select 'invalid'::text, null::uuid, null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  select invite.*
  into v_invite
  from core.volunteer_onboarding_invites invite
  where invite.id = v_context.invite_id
  for update;

  if not found then
    return query
      select 'invalid'::text, null::uuid, null::uuid, null::text, null::uuid, null::text;
    return;
  end if;

  if v_invite.status = 'redeeming'
     and v_invite.redemption_started_at is not null
     and v_invite.redemption_started_at < now() - interval '10 minutes' then
    update core.volunteer_onboarding_invites
    set status = 'sent',
        redemption_nonce = null,
        redemption_started_at = null,
        last_error = 'stale_redemption_released',
        updated_at = now()
    where id = v_invite.id;

    select invite.*
    into v_invite
    from core.volunteer_onboarding_invites invite
    where invite.id = v_context.invite_id
    for update;
  end if;

  if v_invite.status = 'accepted' then
    return query
      select 'used'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  if v_invite.status = 'revoked' then
    return query
      select 'revoked'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  if v_invite.status = 'redeeming' then
    return query
      select 'busy'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  if v_invite.status not in ('pending', 'sent')
     or v_invite.revoked_at is not null
     or v_invite.expires_at is null
     or v_invite.expires_at <= now() then
    return query
      select 'expired'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  if v_invite.locked_until is not null and v_invite.locked_until > now() then
    return query
      select 'locked'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  if v_invite.locked_until is not null and v_invite.locked_until <= now() then
    update core.volunteer_onboarding_invites
    set verification_attempts = 0,
        locked_until = null,
        updated_at = now()
    where id = v_invite.id;
    v_invite.verification_attempts := 0;
    v_invite.locked_until := null;
  end if;

  select volunteer.mobile, volunteer.display_name
  into v_mobile, v_name
  from core.volunteers volunteer
  where volunteer.id = v_invite.volunteer_id
  for update;

  if not found then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'target_volunteer_not_found',
        updated_at = now()
    where id = v_invite.id;

    return query
      select 'target_missing'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, null::text;
    return;
  end if;

  v_expected_mobile := regexp_replace(coalesce(v_mobile, ''), '[^0-9]', '', 'g');
  v_provided_mobile := regexp_replace(coalesce(p_mobile, ''), '[^0-9]', '', 'g');

  if char_length(v_expected_mobile) = 10 and left(v_expected_mobile, 2) = '65' then
    v_expected_mobile := right(v_expected_mobile, 8);
  end if;
  if char_length(v_provided_mobile) = 10 and left(v_provided_mobile, 2) = '65' then
    v_provided_mobile := right(v_provided_mobile, 8);
  end if;

  if char_length(v_expected_mobile) < 8 then
    return query
      select 'no_mobile'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, v_name;
    return;
  end if;

  if v_expected_mobile <> v_provided_mobile then
    v_attempts := coalesce(v_invite.verification_attempts, 0) + 1;

    update core.volunteer_onboarding_invites
    set verification_attempts = v_attempts,
        locked_until = case
          when v_attempts >= 5 then now() + interval '15 minutes'
          else null
        end,
        last_error = case
          when v_attempts >= 5 then 'identity_challenge_locked'
          else 'identity_challenge_mismatch'
        end,
        updated_at = now()
    where id = v_invite.id;

    return query
      select case when v_attempts >= 5 then 'locked' else 'mismatch' end::text,
             v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, v_name;
    return;
  end if;

  update core.volunteer_onboarding_redemption_contexts
  set consumed_at = now()
  where id = v_context.id
    and consumed_at is null;

  update core.volunteer_onboarding_invites
  set status = 'redeeming',
      redemption_nonce = p_redemption_nonce,
      redemption_started_at = now(),
      verification_attempts = 0,
      locked_until = null,
      last_error = null,
      updated_at = now()
  where id = v_invite.id
    and status in ('pending', 'sent');

  if not found then
    return query
      select 'busy'::text, v_invite.id, v_invite.volunteer_id,
             v_invite.email_normalized, v_invite.auth_user_id, v_name;
    return;
  end if;

  return query
    select 'ok'::text, v_invite.id, v_invite.volunteer_id,
           v_invite.email_normalized, v_invite.auth_user_id, v_name;
end;
$function$;

revoke all on function core.begin_volunteer_onboarding_redemption(text, text, uuid)
  from public, anon, authenticated;
grant execute on function core.begin_volunteer_onboarding_redemption(text, text, uuid)
  to service_role;

comment on function core.begin_volunteer_onboarding_redemption(text, text, uuid) is
  'Validates the short-lived redemption context and mobile-number knowledge check, then atomically acquires a redemption lock.';

create or replace function core.complete_volunteer_onboarding_redemption(
  p_invite_id uuid,
  p_redemption_nonce uuid
)
returns text
language plpgsql
security definer
set search_path = ''
as $function$
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

  select invite.*
  into v_invite
  from core.volunteer_onboarding_invites invite
  where invite.id = p_invite_id
    and invite.status = 'redeeming'
    and invite.redemption_nonce = p_redemption_nonce
    and invite.redemption_started_at is not null
    and invite.redemption_started_at >= now() - interval '15 minutes'
  for update;

  if not found then
    return 'invalid_redemption';
  end if;

  select lower(btrim(auth_user.email)), auth_user.email_confirmed_at
  into v_auth_email, v_email_confirmed_at
  from auth.users auth_user
  where auth_user.id = v_user_id;

  if v_auth_email is null or v_email_confirmed_at is null then
    return 'email_unverified';
  end if;

  if v_auth_email <> v_invite.email_normalized then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'verified_email_does_not_match_invitation',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;
    return 'email_mismatch';
  end if;

  if v_invite.auth_user_id is not null and v_invite.auth_user_id <> v_user_id then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'invitation_auth_identity_changed',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;
    return 'identity_conflict';
  end if;

  if v_auth_email like '%@mendaki.org.sg' then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'mendaki_work_email_reserved_for_staff',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;
    return 'staff_access_required';
  end if;

  if not exists (
    select 1 from core.user_accounts account where account.id = v_user_id
  ) then
    return 'account_missing';
  end if;

  if exists (
    select 1 from core.user_roles role
    where role.user_id = v_user_id
      and role.role::text in ('volunteer_leader', 'staff', 'volteam', 'admin')
  ) then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'staff_identity_cannot_be_linked_as_volunteer',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;
    return 'staff_account';
  end if;

  select volunteer.id
  into v_existing_volunteer_id
  from core.volunteers volunteer
  where volunteer.auth_user_id = v_user_id
  limit 1
  for update;

  select volunteer.auth_user_id, volunteer.display_name
  into v_target_auth_user_id, v_target_name
  from core.volunteers volunteer
  where volunteer.id = v_invite.volunteer_id
  for update;

  if not found then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'target_volunteer_not_found',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;
    return 'target_missing';
  end if;

  if (v_target_auth_user_id is not null and v_target_auth_user_id <> v_user_id)
     or (v_existing_volunteer_id is not null and v_existing_volunteer_id <> v_invite.volunteer_id) then
    update core.volunteer_onboarding_invites
    set status = 'failed',
        last_error = 'auth_or_target_identity_conflict',
        redemption_nonce = null,
        redemption_started_at = null,
        updated_at = now()
    where id = v_invite.id;

    insert into core.account_link_cases(
      auth_user_id, status, reason_code, candidate_volunteer_id, submitted_for_review_at
    )
    select v_user_id, 'needs_review', 'onboarding_invite_identity_conflict',
           v_invite.volunteer_id, now()
    where not exists (
      select 1
      from core.account_link_cases review_case
      where review_case.auth_user_id = v_user_id
        and review_case.status in ('pending', 'needs_review')
    );

    return 'identity_conflict';
  end if;

  update core.volunteers
  set auth_user_id = v_user_id,
      primary_email_normalized = v_auth_email,
      account_access_eligible = true,
      updated_at = now()
  where id = v_invite.volunteer_id
    and (auth_user_id is null or auth_user_id = v_user_id);

  update core.user_accounts
  set status = 'active',
      display_name = coalesce(nullif(btrim(v_target_name), ''), display_name),
      claimed_email_normalized = v_auth_email,
      email_ownership_verified = true,
      email_ownership_verified_at = coalesce(
        email_ownership_verified_at,
        v_email_confirmed_at,
        now()
      ),
      updated_at = now()
  where id = v_user_id;

  insert into public.keluarga_volunteer_profiles(volunteer_id)
  values (v_invite.volunteer_id)
  on conflict (volunteer_id) do nothing;

  update public.phaseone_roster
  set volunteer_id = v_invite.volunteer_id
  where volunteer_id is null
    and email_normalized = v_auth_email;

  perform core.ensure_maklom_profile_extension(
    v_invite.volunteer_id,
    'keluarga_account'
  );

  update core.account_link_cases
  set status = 'resolved',
      reason_code = 'resolved_by_admin_onboarding_invite',
      review_outcome = 'matched_existing_deferred',
      candidate_volunteer_id = v_invite.volunteer_id,
      requested_sections = '{}'::text[],
      volunteer_message = null,
      resolution_notes = coalesce(
        resolution_notes,
        'Resolved after the seven-day admin invitation, email possession, and mobile identity challenge were verified.'
      ),
      resolved_by = v_invite.invited_by,
      resolved_at = now()
  where auth_user_id = v_user_id
    and status in ('pending', 'needs_review');

  update core.volunteer_onboarding_invites
  set status = 'accepted',
      auth_user_id = v_user_id,
      accepted_at = coalesce(accepted_at, now()),
      token_hash = null,
      redemption_nonce = null,
      redemption_started_at = null,
      verification_attempts = 0,
      locked_until = null,
      last_error = null,
      updated_at = now()
  where id = v_invite.id
    and status = 'redeeming'
    and redemption_nonce = p_redemption_nonce;

  if not found then
    raise exception 'Redemption ownership changed' using errcode = '40001';
  end if;

  perform audit.write_event(
    'volunteer.onboarding_invite_accepted',
    'volunteer',
    v_invite.volunteer_id::text,
    jsonb_build_object(
      'invite_id', v_invite.id,
      'auth_user_id', v_user_id,
      'email', v_auth_email,
      'email_verification_method', 'admin_onboarding_invitation',
      'identity_challenge', 'mobile'
    ),
    v_user_id,
    null
  );

  if v_existing_volunteer_id = v_invite.volunteer_id then
    return 'already_linked';
  end if;

  return 'linked_existing';
end;
$function$;

revoke all on function core.complete_volunteer_onboarding_redemption(uuid, uuid)
  from public, anon;
grant execute on function core.complete_volunteer_onboarding_redemption(uuid, uuid)
  to authenticated, service_role;

comment on function core.complete_volunteer_onboarding_redemption(uuid, uuid) is
  'Completes a nonce-owned onboarding redemption transaction for the authenticated user and atomically links the canonical volunteer identity.';

commit;
