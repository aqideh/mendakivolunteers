"use client";

import {
  columnFilteringFeature,
  createFilteredRowModel,
  tableFeatures,
  useTable,
  type ColumnDef,
  type ColumnFiltersState,
} from "@tanstack/react-table";
import Fuse from "fuse.js";
import { useRouter } from "next/navigation";
import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
  useTransition,
  type ReactNode,
} from "react";

import { matchesRosterFilter } from "@/lib/phaseone/roster-filter";
import {
  useRosterRow,
  useRosterShiftState,
} from "@/components/phaseone/roster-shift-state";
import { rosterNeedsAttention, type RosterRowDTO } from "@/lib/phaseone/roster-row";

const VIEWS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Not arrived" },
  { value: "signed_in", label: "Checked in" },
  { value: "signed_out", label: "Checked out" },
  { value: "attention", label: "Needs attention" },
] as const;

const STATUSES = [
  ...VIEWS,
  { value: "withdrawn", label: "Withdrawn" },
  { value: "absent", label: "Absent" },
  { value: "anomaly", label: "Attendance anomaly" },
];

type VisibilityFilter = {
  status: string;
  hideWithdrawn: boolean;
  hideAbsent: boolean;
};

const features = tableFeatures({
  columnFilteringFeature,
  filteredRowModel: createFilteredRowModel(),
});

const columns: Array<ColumnDef<typeof features, RosterRowDTO>> = [
  {
    id: "visibility",
    accessorFn: () => true,
    filterFn: (row, _columnId, value) => {
      const filter = value as VisibilityFilter;
      return matchesRosterFilter(
        {
          status: row.original.status,
          filterText: row.original.filterText,
          needsAttention: rosterNeedsAttention(row.original),
        },
        {
          query: "",
          status: filter.status,
          hideWithdrawn: filter.hideWithdrawn,
          hideAbsent: filter.hideAbsent,
        },
      );
    },
  },
];

const RosterVisibilityContext = createContext<ReadonlySet<string> | null>(null);

type Props = {
  initialHideWithdrawn: boolean;
  initialHideAbsent: boolean;
  initialQuery: string;
  initialStatus: string;
  timeslotId: string;
  shifts: { id: string; label: string }[];
  children?: ReactNode;
};

export function RosterFilterCard({
  rosterId,
  highlighted,
  underage,
  children,
}: Readonly<{
  rosterId: string;
  highlighted: boolean;
  underage: boolean;
  children: ReactNode;
}>) {
  const visibleRosterIds = useContext(RosterVisibilityContext);
  const row = useRosterRow(rosterId);
  if (visibleRosterIds && !visibleRosterIds.has(rosterId)) return null;

  return (
    <article
      className="phaseone-attendance-card phaseone-checkin-card"
      data-highlighted={highlighted ? "true" : undefined}
      data-status={row.status}
      data-underage={underage ? "true" : undefined}
      id={`roster-${rosterId}`}
    >
      {children}
    </article>
  );
}

export function RosterFilters({
  initialHideWithdrawn,
  initialHideAbsent,
  initialQuery,
  initialStatus,
  timeslotId,
  shifts,
  children,
}: Props) {
  const router = useRouter();
  const { rows } = useRosterShiftState();
  const [changingShift, startShiftChange] = useTransition();
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [hideWithdrawn, setHideWithdrawn] = useState(initialHideWithdrawn);
  const [hideAbsent, setHideAbsent] = useState(initialHideAbsent);

  useEffect(() => {
    const storageKey = `keluarga:roster-return:v2:${window.location.pathname}:${timeslotId}`;
    const url = new URL(window.location.href);
    let saved: string | null = null;

    try {
      saved = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch {
      // Browser storage is presentation-only and may be unavailable.
    }

    if (saved && (url.searchParams.has("success") || url.searchParams.has("error"))) {
      try {
        const snapshot = JSON.parse(saved) as Record<string, unknown>;
        requestAnimationFrame(() => {
          if (typeof snapshot.query === "string") setQuery(snapshot.query);
          if (
            typeof snapshot.status === "string" &&
            STATUSES.some((option) => option.value === snapshot.status)
          ) {
            setStatus(snapshot.status);
          }
          if (typeof snapshot.hideWithdrawn === "boolean") {
            setHideWithdrawn(snapshot.hideWithdrawn);
          }
          if (typeof snapshot.hideAbsent === "boolean") {
            setHideAbsent(snapshot.hideAbsent);
          }
          const y = snapshot.y;
          if (typeof y === "number" && Number.isFinite(y)) {
            requestAnimationFrame(() =>
              window.scrollTo({ top: y, behavior: "instant" }),
            );
          }
        });
      } catch {
        // Ignore invalid presentation state.
      }
    }
  }, [timeslotId]);

  const counts = useMemo(() => {
    const totals: Record<string, number> = {
      all: rows.length,
      pending: 0,
      signed_in: 0,
      signed_out: 0,
      withdrawn: 0,
      absent: 0,
      anomaly: 0,
      attention: 0,
    };
    for (const row of rows) {
      totals[row.status] = (totals[row.status] ?? 0) + 1;
      if (rosterNeedsAttention(row)) totals.attention = (totals.attention ?? 0) + 1;
    }
    return totals;
  }, [rows]);

  const fuse = useMemo(
    () =>
      new Fuse(rows, {
        threshold: 0.32,
        ignoreLocation: true,
        keys: ["filterText"],
      }),
    [rows],
  );

  const searchedRows = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return rows;

    const exactRows = rows.filter((row) => row.filterText.includes(normalized));
    const seen = new Set(exactRows.map((row) => row.rosterId));
    const fuzzyRows = fuse
      .search(normalized)
      .map(({ item }) => item)
      .filter((row) => {
        if (seen.has(row.rosterId)) return false;
        seen.add(row.rosterId);
        return true;
      });

    return [...exactRows, ...fuzzyRows];
  }, [fuse, query, rows]);

  const columnFilters = useMemo<ColumnFiltersState>(
    () => [
      {
        id: "visibility",
        value: { status, hideWithdrawn, hideAbsent } satisfies VisibilityFilter,
      },
    ],
    [hideAbsent, hideWithdrawn, status],
  );

  const table = useTable({
    features,
    columns,
    data: searchedRows,
    state: { columnFilters },
  });

  const visibleRosterIds = new Set(
    table.getRowModel().rows.map((row) => row.original.rosterId),
  );
  const shownCount = visibleRosterIds.size;

  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set("timeslot", timeslotId);

    for (const [key, value] of [
      ["q", query.trim()],
      ["status", status === "all" ? "" : status],
      ["hideWithdrawn", hideWithdrawn ? "1" : ""],
      ["hideAbsent", hideAbsent ? "1" : ""],
    ] as const) {
      if (value) url.searchParams.set(key, value);
      else url.searchParams.delete(key);
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [hideAbsent, hideWithdrawn, query, status, timeslotId]);

  useEffect(() => {
    const saveView = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLFormElement)) return;
      if (!target.closest(".phaseone-admin-section")) return;

      try {
        sessionStorage.setItem(
          `keluarga:roster-return:v2:${window.location.pathname}:${timeslotId}`,
          JSON.stringify({
            query,
            status,
            hideWithdrawn,
            hideAbsent,
            y: window.scrollY,
          }),
        );
      } catch {
        // Saving attendance never depends on presentation storage.
      }
    };

    document.addEventListener("submit", saveView, true);
    return () => document.removeEventListener("submit", saveView, true);
  }, [hideAbsent, hideWithdrawn, query, status, timeslotId]);

  const active = Boolean(
    query.trim() || status !== "all" || hideWithdrawn || hideAbsent,
  );

  const clear = () => {
    setQuery("");
    setStatus("all");
    setHideWithdrawn(false);
    setHideAbsent(false);
  };

  function selectView(value: string) {
    setStatus(value);
    if (value === "withdrawn") setHideWithdrawn(false);
    if (value === "absent") setHideAbsent(false);
  }

  return (
    <RosterVisibilityContext.Provider value={visibleRosterIds}>
      <div className="km-roster-toolbar" aria-label="Roster controls">
        <div className="km-roster-shift-row">
          <label className="km-roster-shift">
            <span>Deployment shift</span>
            <select
              aria-busy={changingShift}
              disabled={changingShift}
              value={timeslotId}
              onChange={(event) => {
                const url = new URL(window.location.href);
                url.searchParams.set("timeslot", event.target.value);
                for (const key of ["success", "error", "highlight"]) {
                  url.searchParams.delete(key);
                }
                startShiftChange(() =>
                  router.push(`${url.pathname}${url.search}`, { scroll: false }),
                );
              }}
            >
              {shifts.map((shift) => (
                <option key={shift.id} value={shift.id}>
                  {shift.label}
                </option>
              ))}
            </select>
          </label>
          <span className="km-roster-count" role="status">
            {changingShift
              ? "Loading shift…"
              : `${shownCount} of ${counts.all ?? 0} shown`}
          </span>
        </div>

        <div className="km-roster-views" role="group" aria-label="Attendance views">
          {VIEWS.map((view) => (
            <button
              type="button"
              key={view.value}
              aria-pressed={status === view.value}
              onClick={() => selectView(view.value)}
              className="km-roster-view"
            >
              {view.label}
              <span>{counts[view.value] ?? 0}</span>
            </button>
          ))}
        </div>

        <div className="km-roster-search-row">
          <label className="km-roster-search">
            <span className="km-roster-sr-only">Search roster</span>
            <input
              type="search"
              aria-controls="roster-list"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search name, ID or contact…"
            />
          </label>

          <details className="km-roster-filter-menu">
            <summary>Filters{active ? " •" : ""}</summary>
            <div className="km-roster-filter-panel">
              <label>
                Status
                <select
                  value={status}
                  onChange={(event) => selectView(event.target.value)}
                >
                  {STATUSES.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label} ({counts[option.value] ?? 0})
                    </option>
                  ))}
                </select>
              </label>
              <label className="km-roster-check">
                <input
                  type="checkbox"
                  checked={hideWithdrawn}
                  onChange={(event) => setHideWithdrawn(event.target.checked)}
                />
                Hide withdrawn
              </label>
              <label className="km-roster-check">
                <input
                  type="checkbox"
                  checked={hideAbsent}
                  onChange={(event) => setHideAbsent(event.target.checked)}
                />
                Hide absent
              </label>
              <button
                type="button"
                className="button button-secondary"
                onClick={clear}
                disabled={!active}
              >
                Clear filters
              </button>
            </div>
          </details>
        </div>

        {active ? (
          <div className="km-roster-active-filters" aria-label="Active filters">
            {query.trim() ? (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Remove search filter"
              >
                Search: {query.trim()} ×
              </button>
            ) : null}
            {status !== "all" ? (
              <button
                type="button"
                onClick={() => setStatus("all")}
                aria-label="Remove status filter"
              >
                {STATUSES.find((option) => option.value === status)?.label} ×
              </button>
            ) : null}
            {hideWithdrawn ? (
              <button
                type="button"
                onClick={() => setHideWithdrawn(false)}
                aria-label="Show withdrawn volunteers"
              >
                Withdrawn hidden ×
              </button>
            ) : null}
            {hideAbsent ? (
              <button
                type="button"
                onClick={() => setHideAbsent(false)}
                aria-label="Show absent volunteers"
              >
                Absent hidden ×
              </button>
            ) : null}
            <button type="button" onClick={clear}>
              Clear all
            </button>
          </div>
        ) : null}
      </div>

      {children}
      {shownCount === 0 ? (
        <p className="empty-state">No volunteers match these filters.</p>
      ) : null}
    </RosterVisibilityContext.Provider>
  );
}
