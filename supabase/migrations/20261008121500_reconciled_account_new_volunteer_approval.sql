
create or replace function core.approve_reconciled_account_as_new_volunteer(
  p_case_id uuid,
  p_actor_user_id uuid,
  p_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_case core.account_link_cases%rowtype;
  v_account core.user_accounts%rowtype;
  v_volunteer_id uuid;
  v_code text;
  v_email text;
begin
  if p_actor_user_id is null or not exists (
    select 1
    from core.user_accounts account
    join core.user_roles role on role.user_id = account.id
    where account.id = p_actor_user_id
      and account.status = 'active'
      and role.role::text in ('admin','volteam')
  ) then
    raise exception 'Volunteer reconciliation manager authorization is required'
      using errcode = '42501';
  end if;

  select *
  into v_case
  from core.account_link_cases
  where id = p_case_id
    and status in ('pending','needs_review')
  for update;

  if not found then
    raise exception 'This reconciliation case is no longer pending'
      using errcode = 'P0002';
  end if;

  select *
  into v_account
  from core.user_accounts
  where id = v_case.auth_user_id
  for update;

  v_email := nullif(lower(btrim(coalesce(v_account.claimed_email_normalized,''))),'');
  if not found
     or v_account.status <> 'active'
     or not coalesce(v_account.email_ownership_verified,false)
     or v_email is null then
    raise exception 'The account must have a verified email before a new volunteer can be approved'
      using errcode = 'P0001';
  end if;

  select id
  into v_volunteer_id
  from core.volunteers
  where auth_user_id = v_case.auth_user_id
  limit 1;

  if v_volunteer_id is not null then
    raise exception 'This account is already linked to a canonical volunteer'
      using errcode = 'P0001';
  end if;

  insert into core.volunteers(
    auth_user_id,
    display_name,
    primary_email_normalized,
    account_access_eligible
  )
  values (
    v_case.auth_user_id,
    nullif(btrim(v_account.display_name),''),
    v_email,
    false
  )
  returning id,volunteer_code into v_volunteer_id,v_code;

  perform core.ensure_maklom_profile_extension(v_volunteer_id,'reconciled_new_account');

  update core.account_link_cases
  set
    status = 'resolved',
    reason_code = 'verified_account_approved_as_new',
    review_outcome = 'approved_new',
    candidate_volunteer_id = v_volunteer_id,
    requested_sections = '{}'::text[],
    volunteer_message = null,
    resolution_notes = nullif(btrim(coalesce(p_notes,'')),''),
    resolved_by = p_actor_user_id,
    resolved_at = now(),
    updated_at = now()
  where id = v_case.id;

  perform audit.write_event(
    'volunteer.reconciled_account_approved_new',
    'volunteer',
    v_volunteer_id::text,
    jsonb_build_object(
      'case_id',v_case.id,
      'auth_user_id',v_case.auth_user_id,
      'volunteer_code',v_code,
      'verified_email',v_email
    ),
    p_actor_user_id,
    null
  );

  return jsonb_build_object(
    'volunteer_id',v_volunteer_id,
    'volunteer_code',v_code,
    'auth_user_id',v_case.auth_user_id
  );
end;
$$;

revoke all on function core.approve_reconciled_account_as_new_volunteer(uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function core.approve_reconciled_account_as_new_volunteer(uuid,uuid,text)
  to service_role;
