begin;

create or replace function app_private.capture_content_revision()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, content, audit, auth
as $$
declare
  record_kind content.content_kind;
  next_revision integer;
  actor_user_id uuid;
begin
  record_kind := case tg_table_name
    when 'opportunities' then 'opportunity'::content.content_kind
    when 'news_posts' then 'news'::content.content_kind
    else null
  end;

  if record_kind is null then
    raise exception 'Unsupported content table: %', tg_table_name;
  end if;

  actor_user_id := coalesce(auth.uid(), new.updated_by, new.created_by);

  perform pg_advisory_xact_lock(
    hashtextextended(record_kind::text || ':' || new.id::text, 0)
  );

  select coalesce(max(revision_number), 0) + 1
  into next_revision
  from content.revisions
  where content_kind = record_kind
    and content_id = new.id;

  insert into content.revisions (
    content_kind,
    content_id,
    revision_number,
    operation,
    status,
    snapshot,
    actor_user_id
  )
  values (
    record_kind,
    new.id,
    next_revision,
    lower(tg_op),
    new.status,
    to_jsonb(new),
    actor_user_id
  );

  if tg_op = 'INSERT' then
    perform audit.write_event(
      'content.created',
      record_kind::text,
      new.id::text,
      jsonb_build_object('status', new.status, 'revision', next_revision),
      actor_user_id
    );
  elsif old.status is distinct from new.status then
    perform audit.write_event(
      'content.status_changed',
      record_kind::text,
      new.id::text,
      jsonb_build_object(
        'from', old.status,
        'to', new.status,
        'revision', next_revision
      ),
      actor_user_id
    );
  end if;

  return new;
end;
$$;

-- Public pages are server-rendered. Keep their base content tables off the browser Data API.
revoke all on table content.landing_page_media from anon, authenticated;
revoke all on table content.professional_events from anon, authenticated;
revoke all on table content.news_posts from anon, authenticated;
revoke all on table content.opportunities from anon, authenticated;
revoke all on table content.revisions from anon, authenticated;

-- Retired Volunteer.gov.sg import history is not a public runtime source.
revoke all on table public.phaseone_external_opportunities from anon, authenticated;

-- Anonymous users never need direct access to operational/private/MakLom records.
revoke all on table public.keluarga_volunteer_profiles from anon;
revoke all on table public.maklom_profile_inbox from anon;
revoke all on table public.maklom_volunteer_identity from anon;
revoke all on table public.phaseone_opportunity_imports from anon;
revoke all on table public.volunteer_contribution_audit from anon;
revoke all on table public.volunteer_contributions from anon;
revoke all on table public.volunteer_private_details from anon;
revoke all on table public.volunteer_profile_change_inbox from anon;
revoke all on table public.volunteer_shirt_inventory_transactions from anon;
revoke all on table public.volunteer_shirt_issuances from anon;
revoke all on table public.volunteer_shirt_skus from anon;
revoke all on table public.volunteer_shirt_stock from anon;

-- Ordinary authenticated users do not need schema-changing or trigger privileges.
revoke truncate, references, trigger on all tables in schema public from authenticated;
revoke truncate, references, trigger on all tables in schema content from authenticated;

-- Align authenticated DML privileges with the RLS commands that actually exist.
revoke insert, update, delete on table public.app_members from authenticated;
revoke insert, update, delete on table public.audit_log from authenticated;
revoke update on table public.form_submissions from authenticated;
revoke delete on table public.keluarga_volunteer_profiles from authenticated;
revoke insert, delete on table public.maklom_profile_inbox from authenticated;
revoke insert, update, delete on table public.phaseone_opportunity_imports from authenticated;
revoke insert, update, delete on table public.volunteer_contribution_audit from authenticated;
revoke insert, delete on table public.volunteer_contributions from authenticated;
revoke delete on table public.volunteer_private_details from authenticated;
revoke insert, delete on table public.volunteer_profile_change_inbox from authenticated;
revoke insert, update, delete on table public.volunteer_shirt_inventory_transactions from authenticated;
revoke insert, update, delete on table public.volunteer_shirt_issuances from authenticated;
revoke insert, update, delete on table public.volunteer_shirt_skus from authenticated;

-- Read-only analytical views should not carry meaningless mutation privileges.
revoke insert, update, delete on table
  public.maklom_event_participation,
  public.maklom_intelligence_summary,
  public.maklom_participation_monthly,
  public.maklom_retention_summary,
  public.maklom_volunteer_identity,
  public.maklom_volunteer_intelligence,
  public.volunteer_shirt_stock
from authenticated;

commit;
