
create or replace function core.attach_pending_keluarga_registrations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending public.keluarga_registrations%rowtype;
  v_existing public.keluarga_registrations%rowtype;
  v_selected jsonb;
begin
  if new.auth_user_id is null
     or (tg_op = 'UPDATE' and new.auth_user_id is not distinct from old.auth_user_id) then
    return new;
  end if;

  for v_pending in
    select *
    from public.keluarga_registrations
    where auth_user_id = new.auth_user_id
      and volunteer_id is null
      and identity_state = 'needs_review'
    order by submitted_at,id
    for update
  loop
    v_existing := null;

    select *
    into v_existing
    from public.keluarga_registrations
    where volunteer_id = new.id
      and event_id = v_pending.event_id
      and id <> v_pending.id
    order by submitted_at,id
    limit 1
    for update;

    if found then
      select coalesce(jsonb_agg(selection.timeslot_id order by selection.timeslot_id),'[]'::jsonb)
      into v_selected
      from public.keluarga_registration_shifts selection
      where selection.registration_id = v_pending.id;

      if v_existing.status in ('pending','waitlisted') then
        insert into public.keluarga_registration_shifts(registration_id,timeslot_id)
        select v_existing.id,selection.timeslot_id
        from public.keluarga_registration_shifts selection
        where selection.registration_id = v_pending.id
        on conflict do nothing;
      end if;

      -- Remove the auth-owned placeholder before assigning that same account
      -- to the existing canonical registration. This avoids the unique
      -- (auth_user_id,event_id) constraint racing the collision collapse.
      delete from public.keluarga_registrations
      where id = v_pending.id;

      update public.keluarga_registrations
      set
        auth_user_id = coalesce(auth_user_id,new.auth_user_id),
        identity_state = 'resolved',
        identity_resolved_at = coalesce(identity_resolved_at,now()),
        identity_note = coalesce(identity_note,'Canonical volunteer identity resolved from authenticated account.'),
        updated_at = now()
      where id = v_existing.id;

      perform audit.write_event(
        'keluarga.registration_identity_collision_collapsed',
        'keluarga_registration',
        v_existing.id::text,
        jsonb_build_object(
          'superseded_registration_id',v_pending.id,
          'volunteer_id',new.id,
          'auth_user_id',new.auth_user_id,
          'superseded_status',v_pending.status,
          'superseded_timeslot_ids',v_selected,
          'existing_status',v_existing.status
        ),
        null,
        null
      );
    else
      update public.keluarga_registrations
      set
        volunteer_id = new.id,
        identity_state = 'resolved',
        identity_resolved_at = now(),
        identity_note = 'Canonical volunteer identity resolved from authenticated account.',
        updated_at = now()
      where id = v_pending.id;

      perform audit.write_event(
        'keluarga.registration_identity_resolved',
        'keluarga_registration',
        v_pending.id::text,
        jsonb_build_object(
          'volunteer_id',new.id,
          'auth_user_id',new.auth_user_id
        ),
        null,
        null
      );
    end if;
  end loop;

  return new;
end;
$$;
