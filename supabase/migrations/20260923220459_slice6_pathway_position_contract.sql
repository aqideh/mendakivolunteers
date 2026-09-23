begin;

revoke select on pathways.volunteer_positions from public, anon, authenticated;

comment on table pathways.volunteer_positions is
  'Staff-confirmed pathway-position history. Volunteer browsers must use core.get_current_pathway_positions_snapshot(); privileged administration remains server-side.';

commit;
