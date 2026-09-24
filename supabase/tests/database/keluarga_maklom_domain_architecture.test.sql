begin;

select plan(19);

select has_table('core', 'volunteer_aliases', 'canonical volunteer alias table exists');
select has_column('public', 'volunteers', 'core_volunteer_id', 'MakLom profile has canonical volunteer UUID');
select ok(
  (
    select is_nullable = 'NO'
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'volunteers'
      and column_name = 'core_volunteer_id'
  ),
  'MakLom profile canonical volunteer UUID is mandatory'
);
select ok(
  exists (
    select 1
    from pg_constraint constraint_row
    join pg_class relation on relation.oid = constraint_row.conrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'volunteers'
      and constraint_row.contype = 'f'
      and pg_get_constraintdef(constraint_row.oid) like '%core.volunteers%'
  ),
  'MakLom profile references core.volunteers'
);

select has_column('public', 'events', 'keluarga_event_id', 'legacy MakLom event can reference a KELUARGA event');
select has_table('public', 'volunteer_leads', 'MakLom volunteer lead inbox exists');
select col_type_is('public', 'volunteer_leads', 'id', 'text', 'MakLom lead IDs use the shared text-ID contract');
select has_column('public', 'volunteer_leads', 'keluarga_volunteer_id', 'converted leads retain the canonical volunteer UUID');
select has_function('public', 'maklom_convert_volunteer_lead', array['text'], 'MakLom lead conversion RPC exists');

select has_table('public', 'volunteer_contributions', 'reviewed volunteer contribution ledger exists');
select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'volunteer_contributions'
      and policyname = 'volunteer_contributions_select_self_approved'
  ),
  'volunteers can read only approved self contribution records through the dedicated policy'
);
select has_table('public', 'volunteer_profile_change_inbox', 'MakLom profile-change review inbox exists');
select has_table('public', 'maklom_profile_inbox', 'MakLom event insight/review inbox exists');
select has_function(
  'core',
  'refresh_maklom_contribution_candidates',
  array['uuid','uuid'],
  'KELUARGA can refresh attendance candidates for MakLom review'
);

select ok(
  not has_function_privilege(
    'service_role',
    'core.refresh_manual_event_contribution_credits(uuid,uuid)',
    'EXECUTE'
  ),
  'legacy instant contribution credit reconciliation remains disabled'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'core.submit_keluarga_recruitment_application(text,text,text,text,text)',
    'EXECUTE'
  ),
  'retired KELUARGA recruitment submission remains disabled'
);
select ok(
  not has_function_privilege(
    'service_role',
    'core.review_keluarga_recruitment_application(uuid,text,text,uuid)',
    'EXECUTE'
  ),
  'retired KELUARGA recruitment review remains disabled'
);
select ok(
  not has_table_privilege('authenticated', 'core.volunteer_aliases', 'SELECT'),
  'cross-system aliases are not browser-readable'
);
select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_class relation on relation.oid = trigger_row.tgrelid
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname = 'volunteers'
      and trigger_row.tgname = 'volunteers_ensure_canonical_identity'
      and not trigger_row.tgisinternal
  ),
  'new MakLom volunteer profiles must pass through canonical identity assignment'
);

select * from finish();
rollback;
