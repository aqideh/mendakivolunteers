create index if not exists point_ledger_rule_source_idx
  on gamification.point_ledger_entries (rule_id, source_kind);
