create index if not exists reward_partners_created_by_idx
  on gamification.reward_partners(created_by) where created_by is not null;
create index if not exists reward_partners_updated_by_idx
  on gamification.reward_partners(updated_by) where updated_by is not null;
create index if not exists rewards_created_by_idx
  on gamification.rewards(created_by) where created_by is not null;
create index if not exists rewards_updated_by_idx
  on gamification.rewards(updated_by) where updated_by is not null;
create index if not exists reward_redemption_audit_actor_idx
  on gamification.reward_redemption_audit(actor_user_id) where actor_user_id is not null;
create index if not exists reward_partner_report_exports_generated_by_idx
  on gamification.reward_partner_report_exports(generated_by) where generated_by is not null;
