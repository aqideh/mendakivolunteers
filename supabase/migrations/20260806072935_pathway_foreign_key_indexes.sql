create index if not exists pathways_maps_active_version_idx
  on pathways.maps (active_version_id)
  where active_version_id is not null;

create index if not exists pathways_map_versions_created_by_idx
  on pathways.map_versions (created_by)
  where created_by is not null;

create index if not exists pathways_map_versions_published_by_idx
  on pathways.map_versions (published_by)
  where published_by is not null;

create index if not exists pathways_stages_track_version_idx
  on pathways.stages (track_id, version_id);

create index if not exists pathways_stages_phase_version_idx
  on pathways.stages (phase_id, version_id);
