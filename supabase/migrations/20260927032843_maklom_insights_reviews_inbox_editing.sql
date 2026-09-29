begin;

alter table public.maklom_profile_inbox
  add column if not exists reviewed_title text,
  add column if not exists reviewed_payload jsonb;

alter table public.maklom_profile_inbox
  drop constraint if exists maklom_profile_inbox_reviewed_title_length;
alter table public.maklom_profile_inbox
  add constraint maklom_profile_inbox_reviewed_title_length
    check (reviewed_title is null or char_length(btrim(reviewed_title)) between 1 and 240);

alter table public.maklom_profile_inbox
  drop constraint if exists maklom_profile_inbox_reviewed_payload_object;
alter table public.maklom_profile_inbox
  add constraint maklom_profile_inbox_reviewed_payload_object
    check (reviewed_payload is null or jsonb_typeof(reviewed_payload) = 'object');

comment on column public.maklom_profile_inbox.reviewed_title is
  'MakLom-reviewed title. The original source title remains immutable provenance.';
comment on column public.maklom_profile_inbox.reviewed_payload is
  'MakLom-reviewed/editable interpretation. The original source payload remains immutable provenance.';

drop policy if exists "MakLom members can read KELUARGA event context" on public.phaseone_events;
create policy "MakLom members can read KELUARGA event context"
on public.phaseone_events
for select
to authenticated
using (
  exists (
    select 1
    from public.app_members m
    where m.user_id = (select auth.uid())
      and m.active
  )
);

commit;
