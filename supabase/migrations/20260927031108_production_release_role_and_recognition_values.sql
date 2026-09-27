alter type core.app_role
  add value if not exists 'volteam' before 'admin';

alter type core.app_role
  add value if not exists 'staff' before 'volteam';

alter type core.app_role
  add value if not exists 'volunteer_leader' before 'staff';
-- Expand provenance separately: PostgreSQL requires enum values to commit before use.
alter type gamification.point_source_kind add value if not exists 'maklom_approved_contribution';
alter type gamification.point_source_kind add value if not exists 'volunteer_engagement';
alter type gamification.point_source_kind add value if not exists 'approved_hour_milestone';
