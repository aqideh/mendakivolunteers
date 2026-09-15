create table if not exists public.phaseone_volunteer_reviews (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.phaseone_events(id) on delete cascade,
  roster_id uuid not null references public.phaseone_roster(id) on delete cascade,
  volunteer_person_key text not null,
  rating smallint not null,
  positive_behaviors text[] not null default '{}'::text[],
  concern_behaviors text[] not null default '{}'::text[],
  comment text,
  follow_up_required boolean not null default false,
  reviewed_by uuid not null references auth.users(id),
  reviewed_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint phaseone_volunteer_reviews_rating_check check (rating between 1 and 5),
  constraint phaseone_volunteer_reviews_person_key_check check (volunteer_person_key ~ '^(id:|email:|event:).+'),
  constraint phaseone_volunteer_reviews_comment_length check (comment is null or char_length(btrim(comment)) <= 1500),
  constraint phaseone_volunteer_reviews_positive_behaviors_check check (
    positive_behaviors <@ array[
      'proactive','punctual','reliable','good_teamwork','engaged','takes_initiative',
      'communicates_well','good_with_participants','follows_instructions','leadership','safety_conscious'
    ]::text[]
  ),
  constraint phaseone_volunteer_reviews_concern_behaviors_check check (
    concern_behaviors <@ array[
      'late','unreliable','disengaged','teamwork_concern','did_not_follow_instructions',
      'inappropriate_conduct','safety_concern','communication_concern','participant_interaction_concern'
    ]::text[]
  ),
  constraint phaseone_volunteer_reviews_staff_event_person_uidx unique (event_id, volunteer_person_key, reviewed_by)
);

create index if not exists phaseone_volunteer_reviews_event_person_idx
  on public.phaseone_volunteer_reviews (event_id, volunteer_person_key, reviewed_at desc);
create index if not exists phaseone_volunteer_reviews_roster_idx
  on public.phaseone_volunteer_reviews (roster_id);
create index if not exists phaseone_volunteer_reviews_reviewer_idx
  on public.phaseone_volunteer_reviews (reviewed_by, reviewed_at desc);
create index if not exists phaseone_volunteer_reviews_follow_up_idx
  on public.phaseone_volunteer_reviews (event_id, follow_up_required, reviewed_at desc)
  where follow_up_required = true;

alter table public.phaseone_volunteer_reviews enable row level security;
revoke all on table public.phaseone_volunteer_reviews from anon, authenticated;
grant select, insert, update, delete on table public.phaseone_volunteer_reviews to service_role;

comment on table public.phaseone_volunteer_reviews is
  'Event-level staff performance reviews for volunteers. Multiple staff may review the same volunteer, but each staff member has one review per volunteer per event.';
comment on column public.phaseone_volunteer_reviews.volunteer_person_key is
  'Stable event-operations person key copied from phaseone_roster.attendance_person_key so reviews follow the same volunteer across shifts.';
comment on column public.phaseone_volunteer_reviews.follow_up_required is
  'Operational flag for staff follow-up; a low star rating alone does not create a conduct or safeguarding flag.';

create or replace function public.phaseone_assign_attendance_person_key()
returns trigger
language plpgsql
set search_path to 'public', 'pg_temp'
as $function$
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

  if old.entry_method = 'walk_in' then
    new.attendance_person_key := old.attendance_person_key;
    return new;
  end if;

  if new.attendance_person_key is distinct from old.attendance_person_key then
    new.attendance_person_key := lower(btrim(new.attendance_person_key));
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
$function$;
