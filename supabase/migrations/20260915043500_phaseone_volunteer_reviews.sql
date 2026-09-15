create table if not exists public.phaseone_volunteer_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  volunteer_person_key text not null,
  rating smallint not null,
  positive_behaviors text[] not null default '{}'::text[],
  concern_behaviors text[] not null default '{}'::text[],
  comments text,
  follow_up_required boolean not null default false,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_volunteer_reviews_rating_check check (rating between 1 and 5),
  constraint phaseone_volunteer_reviews_positive_behaviors_check check (
    positive_behaviors <@ array[
      'proactive','punctual','reliable','good_teamwork','engaged','takes_initiative',
      'communicates_well','good_with_participants','follows_instructions','safety_conscious'
    ]::text[]
    and cardinality(positive_behaviors) <= 10
  ),
  constraint phaseone_volunteer_reviews_concern_behaviors_check check (
    concern_behaviors <@ array[
      'late','unreliable','disengaged','teamwork_concern','did_not_follow_instructions',
      'inappropriate_conduct','participant_interaction_concern','safety_concern',
      'communication_concern','left_early'
    ]::text[]
    and cardinality(concern_behaviors) <= 10
  ),
  constraint phaseone_volunteer_reviews_comments_length check (
    comments is null or char_length(comments) <= 2000
  ),
  constraint phaseone_volunteer_reviews_staff_event_person_uidx unique (
    event_id, volunteer_person_key, reviewed_by
  )
);

create index if not exists phaseone_volunteer_reviews_event_idx
  on public.phaseone_volunteer_reviews (event_id, reviewed_at desc);
create index if not exists phaseone_volunteer_reviews_person_idx
  on public.phaseone_volunteer_reviews (volunteer_person_key, reviewed_at desc);
create index if not exists phaseone_volunteer_reviews_roster_idx
  on public.phaseone_volunteer_reviews (roster_id, reviewed_at desc);
create index if not exists phaseone_volunteer_reviews_follow_up_idx
  on public.phaseone_volunteer_reviews (event_id, follow_up_required, reviewed_at desc)
  where follow_up_required = true;

alter table public.phaseone_volunteer_reviews enable row level security;
revoke all on public.phaseone_volunteer_reviews from anon, authenticated;
grant select, insert, update, delete on public.phaseone_volunteer_reviews to service_role;

comment on table public.phaseone_volunteer_reviews is
  'Event-level staff performance reviews for volunteers. Multiple staff may review the same volunteer; each staff member has at most one review per volunteer per event.';
comment on column public.phaseone_volunteer_reviews.volunteer_person_key is
  'Stable event-operations person key copied from phaseone_roster.attendance_person_key so reviews span linked shifts.';

create table if not exists public.phaseone_roster_edit_audit (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  volunteer_person_key text not null,
  old_values jsonb not null,
  new_values jsonb not null,
  affected_rows integer not null check (affected_rows > 0),
  changed_by uuid not null references auth.users(id),
  changed_at timestamptz not null default now()
);

create index if not exists phaseone_roster_edit_audit_event_idx
  on public.phaseone_roster_edit_audit (event_id, changed_at desc);
create index if not exists phaseone_roster_edit_audit_person_idx
  on public.phaseone_roster_edit_audit (volunteer_person_key, changed_at desc);

alter table public.phaseone_roster_edit_audit enable row level security;
revoke all on public.phaseone_roster_edit_audit from anon, authenticated;
grant select, insert on public.phaseone_roster_edit_audit to service_role;

create or replace function public.phaseone_assign_attendance_person_key()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if tg_op = 'INSERT' then
    new.attendance_person_key := case
      when nullif(btrim(new.attendance_person_key), '') is not null
        then lower(btrim(new.attendance_person_key))
      when nullif(btrim(new.volunteer_key), '') is not null
        then 'id:' || lower(btrim(new.volunteer_key))
      when nullif(btrim(new.email), '') is not null
        then 'email:' || lower(btrim(new.email))
      else 'event:' || gen_random_uuid()::text
    end;
    return new;
  end if;

  if new.attendance_person_key is distinct from old.attendance_person_key then
    new.attendance_person_key := lower(btrim(new.attendance_person_key));
    return new;
  end if;

  -- Walk-in identity must remain stable after on-site typo corrections so an
  -- active attendance session, insights and reviews are not split by an email edit.
  if old.entry_method = 'walk_in' then
    return new;
  end if;

  if old.attendance_person_key like 'event:%' then
    if nullif(btrim(new.volunteer_key), '') is not null then
      new.attendance_person_key := 'id:' || lower(btrim(new.volunteer_key));
    elsif nullif(btrim(new.email), '') is not null then
      new.attendance_person_key := 'email:' || lower(btrim(new.email));
    end if;
  end if;

  return new;
end;
$$;

create or replace function public.phaseone_update_walk_in_volunteer(
  p_event_id uuid,
  p_roster_id uuid,
  p_volunteer_name text,
  p_email text,
  p_mobile text,
  p_changed_by uuid
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_source public.phaseone_roster%rowtype;
  v_name text := btrim(coalesce(p_volunteer_name, ''));
  v_email text := nullif(btrim(coalesce(p_email, '')), '');
  v_mobile text := nullif(btrim(coalesce(p_mobile, '')), '');
  v_affected integer := 0;
begin
  if not exists (select 1 from auth.users where id = p_changed_by) then
    raise exception 'Staff user not found';
  end if;

  select * into v_source
  from public.phaseone_roster
  where id = p_roster_id and event_id = p_event_id;

  if not found then
    raise exception 'Roster record does not belong to this event';
  end if;
  if v_source.entry_method <> 'walk_in' then
    raise exception 'Only walk-in volunteer details can be edited here';
  end if;
  if v_name = '' or char_length(v_name) > 200 then
    raise exception 'Volunteer name must be between 1 and 200 characters';
  end if;
  if v_email is not null and char_length(v_email) > 320 then
    raise exception 'Email must be 320 characters or fewer';
  end if;
  if v_mobile is not null and char_length(v_mobile) > 50 then
    raise exception 'Contact number must be 50 characters or fewer';
  end if;

  update public.phaseone_roster
  set volunteer_name = v_name,
      email = v_email,
      mobile = v_mobile
  where event_id = p_event_id
    and attendance_person_key = v_source.attendance_person_key
    and entry_method = 'walk_in';

  get diagnostics v_affected = row_count;
  if v_affected = 0 then
    raise exception 'Walk-in volunteer details could not be updated';
  end if;

  insert into public.phaseone_roster_edit_audit (
    event_id,
    roster_id,
    volunteer_person_key,
    old_values,
    new_values,
    affected_rows,
    changed_by
  ) values (
    p_event_id,
    p_roster_id,
    v_source.attendance_person_key,
    jsonb_build_object(
      'volunteer_name', v_source.volunteer_name,
      'email', v_source.email,
      'mobile', v_source.mobile
    ),
    jsonb_build_object(
      'volunteer_name', v_name,
      'email', v_email,
      'mobile', v_mobile
    ),
    v_affected,
    p_changed_by
  );

  return jsonb_build_object(
    'status', 'updated',
    'roster_id', p_roster_id,
    'volunteer_person_key', v_source.attendance_person_key,
    'affected_rows', v_affected
  );
end;
$$;

revoke all on function public.phaseone_update_walk_in_volunteer(uuid, uuid, text, text, text, uuid)
  from public, anon, authenticated;
grant execute on function public.phaseone_update_walk_in_volunteer(uuid, uuid, text, text, text, uuid)
  to service_role;
