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
  -- Trusted service-role and migration operations have no end-user auth context.
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

  -- Editing an already privileged record also requires publisher access, even
  -- when the status value itself is unchanged. This prevents an editor from
  -- modifying live content through a direct Data API request.
  if (
    old.status = any(privileged_statuses)
    or new.status = any(privileged_statuses)
  )
    and not app_private.can_publish_content()
  then
    raise exception 'Publisher permission is required to edit privileged content'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_content_status_transition()
  from public, anon, authenticated;
grant execute on function app_private.enforce_content_status_transition()
  to service_role;

commit;
