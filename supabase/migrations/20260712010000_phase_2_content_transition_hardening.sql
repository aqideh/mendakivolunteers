begin;

create or replace function app_private.enforce_content_status_transition()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, app_private, auth
as $$
declare
  privileged_statuses content.content_status[] := array[
    'scheduled'::content.content_status,
    'published'::content.content_status,
    'archived'::content.content_status
  ];
begin
  -- Service-role and migration operations have no end-user auth context.
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.status = any(privileged_statuses)
      and not app_private.can_publish_content()
    then
      raise exception 'Publisher permission is required for this content status'
        using errcode = '42501';
    end if;

    return new;
  end if;

  if old.status is distinct from new.status
    and (
      old.status = any(privileged_statuses)
      or new.status = any(privileged_statuses)
    )
    and not app_private.can_publish_content()
  then
    raise exception 'Publisher permission is required for this content status transition'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger opportunities_enforce_status_transition
before insert or update on content.opportunities
for each row execute function app_private.enforce_content_status_transition();

create trigger news_posts_enforce_status_transition
before insert or update on content.news_posts
for each row execute function app_private.enforce_content_status_transition();

revoke all on function app_private.enforce_content_status_transition()
  from public, anon, authenticated;
grant execute on function app_private.enforce_content_status_transition()
  to service_role;

commit;
