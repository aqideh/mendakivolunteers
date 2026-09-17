begin;

create or replace function core.get_ymhub_batch_summary()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, core, integration
as $$
  select jsonb_build_object(
    'import_batches', (
      select count(*)::integer
      from integration.ymhub_import_batches
    ),
    'committed_import_batches', (
      select count(*)::integer
      from integration.ymhub_import_batches
      where status = 'committed'
    ),
    'open_import_exceptions', (
      select count(*)::integer
      from integration.ymhub_import_exceptions
      where resolved_at is null
    ),
    'export_batches', (
      select count(*)::integer
      from integration.ymhub_export_batches
    ),
    'pending_export_batches', (
      select count(*)::integer
      from integration.ymhub_export_batches
      where status in ('generated', 'handed_off')
    ),
    'latest_import_at', (
      select max(imported_at)
      from integration.ymhub_import_files
      where status = 'committed'
    ),
    'latest_export_at', (
      select max(generated_at)
      from integration.ymhub_export_batches
    )
  );
$$;

comment on function core.get_ymhub_batch_summary() is
  'Server-only aggregate for the staff Batch Centre. Does not expose raw integration rows or volunteer personal data.';

revoke all on function core.get_ymhub_batch_summary()
  from public, anon, authenticated;
grant execute on function core.get_ymhub_batch_summary()
  to service_role;

commit;
