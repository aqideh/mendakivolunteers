create or replace function maklom_private.log_maklom_change()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
declare
  record_id text;
  version_value text;
begin
  if tg_table_schema <> 'public'
     or tg_table_name not in (
       'volunteers',
       'attendance_log',
       'reporting_metrics',
       'suspected_duplicates',
       'merge_log',
       'form_import_batches',
       'form_submissions',
       'attendance_reconciliations',
       'events',
       'event_shifts',
       'event_impact_metrics',
       'volunteer_leads'
     ) then
    raise exception 'MakLom audit trigger invoked from unexpected relation %.%',
      tg_table_schema,
      tg_table_name;
  end if;

  if tg_op='DELETE' then
    record_id=old.id;
    version_value=to_jsonb(old)->>'row_version';
  else
    record_id=new.id;
    version_value=to_jsonb(new)->>'row_version';
  end if;

  insert into public.audit_log(
    actor_user_id,
    entity_type,
    entity_id,
    action,
    details
  )
  values(
    auth.uid(),
    tg_table_name,
    record_id,
    lower(tg_op),
    jsonb_strip_nulls(
      jsonb_build_object(
        'source','database-trigger',
        'row_version',version_value
      )
    )
  );

  if tg_op='DELETE' then
    return old;
  end if;
  return new;
end;
$$;

revoke all on function maklom_private.log_maklom_change()
  from public,anon,authenticated;

comment on function maklom_private.log_maklom_change() is
  'Audits the approved MakLom managed-table allow-list, including volunteer_leads.';
