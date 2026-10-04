export type RosterFilter = {
  query: string;
  status: string;
  hideWithdrawn: boolean;
  hideAbsent: boolean;
};

export function matchesRosterFilter(
  row: { status: string; filterText: string; needsAttention: boolean },
  filter: RosterFilter,
): boolean {
  const query = filter.query.trim().toLowerCase();
  const matchesStatus = filter.status === "all"
    || (filter.status === "attention" ? row.needsAttention : row.status === filter.status);
  return matchesStatus
    && !(filter.hideWithdrawn && row.status === "withdrawn")
    && !(filter.hideAbsent && row.status === "absent")
    && (!query || row.filterText.toLowerCase().includes(query));
}
