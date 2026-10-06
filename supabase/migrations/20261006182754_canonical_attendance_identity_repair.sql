create or replace function core.resolve_roster_volunteer_from_unique_email()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog','public','core'
as $$
declare
  matched_ids uuid[];
  matched_code text;
begin
  if new.volunteer_id is not null then
    select v.volunteer_code into matched_code
    from core.volunteers v
    where v.id=new.volunteer_id;

    if matched_code is not null then
      new.volunteer_key:=matched_code;
    end if;
    return new;
  end if;

  if new.email_normalized is null or btrim(new.email_normalized)='' then
    return new;
  end if;

  select array_agg(v.id order by v.id)
  into matched_ids
  from core.volunteers v
  where v.primary_email_normalized=lower(btrim(new.email_normalized));

  if coalesce(cardinality(matched_ids),0)=1 then
    new.volunteer_id:=matched_ids[1];

    select v.volunteer_code into matched_code
    from core.volunteers v
    where v.id=matched_ids[1];

    if matched_code is not null then
      new.volunteer_key:=matched_code;
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.phaseone_assign_attendance_person_key()
returns trigger
language plpgsql
set search_path to 'public','pg_temp'
as $$
begin
  if new.volunteer_id is not null
     and nullif(btrim(new.volunteer_key),'') is not null then
    new.attendance_person_key:='id:'||lower(btrim(new.volunteer_key));
    return new;
  end if;

  if tg_op='INSERT' then
    new.attendance_person_key:=case
      when nullif(btrim(new.attendance_person_key),'') is not null then lower(btrim(new.attendance_person_key))
      when nullif(btrim(new.volunteer_key),'') is not null then 'id:'||lower(btrim(new.volunteer_key))
      when nullif(btrim(new.email),'') is not null then 'email:'||lower(btrim(new.email))
      else 'event:'||gen_random_uuid()::text
    end;
    return new;
  end if;

  if old.entry_method='walk_in' then
    new.attendance_person_key:=old.attendance_person_key;
    return new;
  end if;

  if new.attendance_person_key is distinct from old.attendance_person_key then
    new.attendance_person_key:=lower(btrim(new.attendance_person_key));
    return new;
  end if;

  if old.attendance_person_key like 'event:%' then
    if nullif(btrim(new.volunteer_key),'') is not null then
      new.attendance_person_key:='id:'||lower(btrim(new.volunteer_key));
    elsif nullif(btrim(new.email),'') is not null then
      new.attendance_person_key:='email:'||lower(btrim(new.email));
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists phaseone_roster_assign_attendance_person_key on public.phaseone_roster;
drop trigger if exists zz_phaseone_roster_assign_attendance_person_key on public.phaseone_roster;
create trigger zz_phaseone_roster_assign_attendance_person_key
before insert or update on public.phaseone_roster
for each row execute function public.phaseone_assign_attendance_person_key();

update public.phaseone_roster r
set volunteer_key=v.volunteer_code,
    attendance_person_key='id:'||lower(v.volunteer_code)
from core.volunteers v
where r.volunteer_id=v.id
  and (
    upper(btrim(coalesce(r.volunteer_key,''))) is distinct from upper(v.volunteer_code)
    or r.attendance_person_key is distinct from 'id:'||lower(v.volunteer_code)
  );

do $$
declare
  g record;
  ids uuid[];
  v_keep uuid;
  v_drop uuid;
  v_keep_origin uuid;
  v_canonical_key text;
  v_first_in timestamptz;
  v_last_out timestamptz;
  v_first_by uuid;
  v_last_by uuid;
  v_drop_contribution jsonb;
begin
  for g in
    select r.volunteer_id,s.event_id,s.attendance_date,min(v.volunteer_code) as volunteer_code,count(*)::integer as session_count
    from public.phaseone_attendance_sessions s
    join public.phaseone_roster r on r.id=s.origin_roster_id
    join core.volunteers v on v.id=r.volunteer_id
    where r.volunteer_id is not null
    group by r.volunteer_id,s.event_id,s.attendance_date
    having count(*)>1
  loop
    if g.session_count<>2 then
      raise exception 'Unexpected duplicate attendance group with % sessions for volunteer % event % date %',
        g.session_count,g.volunteer_id,g.event_id,g.attendance_date;
    end if;

    select array_agg(s.id order by s.created_at,s.id)
    into ids
    from public.phaseone_attendance_sessions s
    join public.phaseone_roster r on r.id=s.origin_roster_id
    where r.volunteer_id=g.volunteer_id
      and s.event_id=g.event_id
      and s.attendance_date=g.attendance_date;

    v_keep:=ids[1];
    v_drop:=ids[2];
    v_canonical_key:='id:'||lower(g.volunteer_code);

    if not exists (
      select 1
      from public.phaseone_attendance_sessions a
      join public.phaseone_attendance_sessions b on b.id=v_drop
      where a.id=v_keep
        and tstzrange(a.checked_in_at,coalesce(a.checked_out_at,'infinity'::timestamptz),'[]')
            && tstzrange(b.checked_in_at,coalesce(b.checked_out_at,'infinity'::timestamptz),'[]')
    ) then
      raise exception 'Duplicate sessions do not overlap for volunteer % event % date %',
        g.volunteer_id,g.event_id,g.attendance_date;
    end if;

    if exists (
      select 1 from public.volunteer_contributions c
      where c.attendance_session_id in (v_keep,v_drop)
        and c.status not in ('pending','needs_review')
    ) then
      raise exception 'Duplicate attendance has reviewed contribution credit for volunteer % event % date %',
        g.volunteer_id,g.event_id,g.attendance_date;
    end if;

    if exists (
      select 1 from public.keluarga_contribution_credits c
      where c.attendance_session_id=v_drop
    ) then
      raise exception 'Duplicate attendance is referenced by contribution credit for volunteer % event % date %',
        g.volunteer_id,g.event_id,g.attendance_date;
    end if;

    select min(s.checked_in_at),max(s.checked_out_at)
    into v_first_in,v_last_out
    from public.phaseone_attendance_sessions s
    where s.id in (v_keep,v_drop);

    select s.checked_in_by into v_first_by
    from public.phaseone_attendance_sessions s
    where s.id in (v_keep,v_drop)
    order by s.checked_in_at asc,s.created_at asc
    limit 1;

    select s.checked_out_by into v_last_by
    from public.phaseone_attendance_sessions s
    where s.id in (v_keep,v_drop)
    order by s.checked_out_at desc nulls last,s.created_at asc
    limit 1;

    select s.origin_roster_id into v_keep_origin
    from public.phaseone_attendance_sessions s
    where s.id=v_keep;

    select to_jsonb(c) into v_drop_contribution
    from public.volunteer_contributions c
    where c.attendance_session_id=v_drop;

    perform audit.write_event(
      'attendance.identity_duplicate_merge_started',
      'attendance_session',
      v_keep::text,
      jsonb_build_object(
        'duplicate_session_id',v_drop,
        'volunteer_id',g.volunteer_id,
        'event_id',g.event_id,
        'attendance_date',g.attendance_date,
        'duplicate_contribution',v_drop_contribution
      ),
      null,null
    );

    insert into public.phaseone_attendance_session_shifts(
      session_id,event_id,roster_id,timeslot_id,continuation_type,linked_by
    )
    select
      v_keep,ss.event_id,ss.roster_id,ss.timeslot_id,
      case when ss.roster_id=v_keep_origin then 'origin' else 'scheduled' end,
      ss.linked_by
    from public.phaseone_attendance_session_shifts ss
    where ss.session_id=v_drop
    on conflict(session_id,roster_id) do nothing;

    update public.historical_attendance_import_rows
    set committed_keluarga_session_id=v_keep,
        match_reason=concat_ws('; ',nullif(match_reason,''),'Merged duplicate attendance session after canonical identity repair')
    where committed_keluarga_session_id=v_drop;

    update public.phaseone_attendance_session_audit
    set metadata=coalesce(metadata,'{}'::jsonb)||jsonb_build_object(
      'merged_into_session_id',v_keep,
      'identity_repair',true
    )
    where session_id=v_drop;

    delete from public.volunteer_contributions
    where attendance_session_id=v_drop;

    delete from public.phaseone_attendance_sessions
    where id=v_drop;

    update public.phaseone_attendance_sessions
    set person_key=v_canonical_key,
        checked_in_at=v_first_in,
        checked_out_at=v_last_out,
        checked_in_by=v_first_by,
        checked_out_by=v_last_by,
        updated_at=now()
    where id=v_keep;

    insert into public.phaseone_attendance_session_audit(
      session_id,event_id,roster_id,action,metadata,changed_by
    )
    values(
      v_keep,g.event_id,v_keep_origin,'session_backfilled',
      jsonb_build_object(
        'repair_kind','identity_duplicate_merge',
        'merged_session_id',v_drop,
        'canonical_person_key',v_canonical_key,
        'checked_in_at',v_first_in,
        'checked_out_at',v_last_out
      ),
      null
    );

    perform audit.write_event(
      'attendance.identity_duplicate_merged',
      'attendance_session',
      v_keep::text,
      jsonb_build_object(
        'merged_session_id',v_drop,
        'volunteer_id',g.volunteer_id,
        'event_id',g.event_id,
        'attendance_date',g.attendance_date,
        'canonical_person_key',v_canonical_key,
        'checked_in_at',v_first_in,
        'checked_out_at',v_last_out
      ),
      null,null
    );
  end loop;
end;
$$;

update public.phaseone_attendance_sessions s
set person_key='id:'||lower(v.volunteer_code)
from public.phaseone_roster r
join core.volunteers v on v.id=r.volunteer_id
where s.origin_roster_id=r.id
  and r.volunteer_id is not null
  and s.person_key is distinct from 'id:'||lower(v.volunteer_code);

do $$
begin
  if exists (
    select 1
    from public.phaseone_attendance_sessions s
    join public.phaseone_roster r on r.id=s.origin_roster_id
    join core.volunteers v on v.id=r.volunteer_id
    where r.volunteer_id is not null
      and s.person_key is distinct from 'id:'||lower(v.volunteer_code)
  ) then
    raise exception 'Session identity backfill incomplete';
  end if;

  if exists (
    select 1
    from public.phaseone_roster r
    join core.volunteers v on v.id=r.volunteer_id
    where r.volunteer_id is not null
      and (
        upper(btrim(coalesce(r.volunteer_key,''))) is distinct from upper(v.volunteer_code)
        or r.attendance_person_key is distinct from 'id:'||lower(v.volunteer_code)
      )
  ) then
    raise exception 'Roster identity backfill incomplete';
  end if;

  if exists (
    select 1
    from public.phaseone_attendance_sessions s
    join public.phaseone_roster r on r.id=s.origin_roster_id
    where r.volunteer_id is not null
    group by r.volunteer_id,s.event_id,s.attendance_date
    having count(*)>1
  ) then
    raise exception 'Duplicate canonical attendance sessions remain';
  end if;
end;
$$;
