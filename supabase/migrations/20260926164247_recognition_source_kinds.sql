-- Expand provenance separately: PostgreSQL requires enum values to commit before use.
alter type gamification.point_source_kind add value if not exists 'maklom_approved_contribution';
alter type gamification.point_source_kind add value if not exists 'volunteer_engagement';
alter type gamification.point_source_kind add value if not exists 'approved_hour_milestone';
