"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react";
import { matchesRosterFilter } from "@/lib/phaseone/roster-filter";

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
type Props = {
  initialHideWithdrawn: boolean;
  initialHideAbsent: boolean;
  initialQuery: string;
  initialShownCount: number;
  initialStatus: string;
  initialCounts: Record<string, number>;
  timeslotId: string;
  shifts: { id: string; label: string }[];
  children?: ReactNode;
};

export function RosterFilters({
  initialHideWithdrawn, initialHideAbsent, initialQuery, initialShownCount,
  initialStatus, initialCounts, timeslotId, shifts, children,
}: Props) {
  const router = useRouter();
  const [changingShift, startShiftChange] = useTransition();
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [hideWithdrawn, setHideWithdrawn] = useState(initialHideWithdrawn);
  const [hideAbsent, setHideAbsent] = useState(initialHideAbsent);
  const [shownCount, setShownCount] = useState(initialShownCount);
  const [counts, setCounts] = useState(initialCounts);

  useEffect(() => {
    const section = rootRef.current?.closest<HTMLElement>(".phaseone-admin-section");
    if (!section) return;
    const storageKey = `keluarga:roster-return:v1:${window.location.pathname}:${timeslotId}`;
    // Only restore a one-use snapshot after a roster form's redirect.
    const url = new URL(window.location.href);
    let saved: string | null = null;
    try {
      saved = sessionStorage.getItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch { /* Browser storage may be unavailable. */ }
    if (saved && (url.searchParams.has("success") || url.searchParams.has("error"))) {
      try {
        const snapshot = JSON.parse(saved) as Record<string, unknown>;
        if (typeof snapshot.query === "string") setQuery(snapshot.query);
        if (typeof snapshot.status === "string" && STATUSES.some(option => option.value === snapshot.status)) setStatus(snapshot.status);
        if (typeof snapshot.hideWithdrawn === "boolean") setHideWithdrawn(snapshot.hideWithdrawn);
        if (typeof snapshot.hideAbsent === "boolean") setHideAbsent(snapshot.hideAbsent);
        const y = snapshot.y;
        if (typeof y === "number" && Number.isFinite(y)) {
          requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: y, behavior: "instant" })));
        }
      } catch { /* Ignore invalid presentation state. */ }
    }
  }, [timeslotId]);

  useEffect(() => {
    const section = rootRef.current?.closest<HTMLElement>(".phaseone-admin-section");
    const list = section?.querySelector<HTMLElement>("#roster-list");
    if (!section || !list) return;
    const applyFilters = () => {
      let shown = 0;
      const totals: Record<string, number> = { all: 0, pending: 0, signed_in: 0, signed_out: 0, withdrawn: 0, absent: 0, anomaly: 0, attention: 0 };
      list.querySelectorAll<HTMLElement>("[data-roster-filterable]").forEach(card => {
        const row = {
          status: card.dataset.status ?? "pending",
          filterText: card.dataset.filterText ?? "",
          needsAttention: card.dataset.needsAttention === "true",
        };
        totals.all += 1;
        totals[row.status] = (totals[row.status] ?? 0) + 1;
        if (row.needsAttention) totals.attention += 1;
        const visible = matchesRosterFilter(row, { query, status, hideWithdrawn, hideAbsent });
        card.hidden = !visible;
        if (visible) shown += 1;
      });
      setShownCount(shown);
      setCounts(previous => JSON.stringify(previous) === JSON.stringify(totals) ? previous : totals);
      const empty = list.querySelector<HTMLElement>("[data-roster-empty-state]");
      if (empty) empty.hidden = shown > 0;
    };
    applyFilters();
    const observer = new MutationObserver(applyFilters);
    observer.observe(list, {
      childList: true, subtree: true, attributes: true,
      attributeFilter: ["data-status", "data-filter-text", "data-needs-attention"],
    });
    const url = new URL(window.location.href);
    url.searchParams.set("timeslot", timeslotId);
    for (const [key, value] of [
      ["q", query.trim()], ["status", status === "all" ? "" : status],
      ["hideWithdrawn", hideWithdrawn ? "1" : ""], ["hideAbsent", hideAbsent ? "1" : ""],
    ]) {
      if (value) url.searchParams.set(key, value); else url.searchParams.delete(key);
    }
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    const saveView = () => {
      try {
      sessionStorage.setItem(
        `keluarga:roster-return:v1:${window.location.pathname}:${timeslotId}`,
        JSON.stringify({ query, status, hideWithdrawn, hideAbsent, y: window.scrollY }),
      );
      } catch { /* Saving attendance does not depend on presentation storage. */ }
    };
    section.addEventListener("submit", saveView, true);
    return () => {
      observer.disconnect();
      section.removeEventListener("submit", saveView, true);
    };
  }, [query, status, hideWithdrawn, hideAbsent, timeslotId]);

  const active = Boolean(query.trim() || status !== "all" || hideWithdrawn || hideAbsent);
  const clear = () => { setQuery(""); setStatus("all"); setHideWithdrawn(false); setHideAbsent(false); };
  function selectView(value: string) {
    setStatus(value);
    if (value === "withdrawn") setHideWithdrawn(false);
    if (value === "absent") setHideAbsent(false);
  }
  return (
    <div className="km-roster-toolbar" ref={rootRef} aria-label="Roster controls">
      <div className="km-roster-shift-row">
        <label className="km-roster-shift">
          <span>Deployment shift</span>
          <select aria-busy={changingShift} disabled={changingShift} value={timeslotId}
            onChange={event => {
              const url = new URL(window.location.href);
              url.searchParams.set("timeslot", event.target.value);
              for (const key of ["success", "error", "highlight"]) url.searchParams.delete(key);
              startShiftChange(() => router.push(`${url.pathname}${url.search}`, { scroll: false }));
            }}>
            {shifts.map(shift => <option key={shift.id} value={shift.id}>{shift.label}</option>)}
          </select>
        </label>
        <span className="km-roster-count" role="status">{changingShift ? "Loading shift…" : `${shownCount} of ${counts.all ?? 0} shown`}</span>
      </div>
      <div className="km-roster-views" role="group" aria-label="Attendance views">
        {VIEWS.map(view => (
          <button type="button" key={view.value} aria-pressed={status === view.value}
            onClick={() => selectView(view.value)} className="km-roster-view">
            {view.label}<span>{counts[view.value] ?? 0}</span>
          </button>
        ))}
      </div>
      <div className="km-roster-search-row">
        <label className="km-roster-search">
          <span className="km-roster-sr-only">Search roster</span>
          <input type="search" aria-controls="roster-list" value={query}
            onChange={event => setQuery(event.target.value)} placeholder="Search name, ID or contact…" />
        </label>
        <details className="km-roster-filter-menu">
          <summary>Filters{active ? " •" : ""}</summary>
          <div className="km-roster-filter-panel">
            <label>Status
              <select value={status} onChange={event => selectView(event.target.value)}>
                {STATUSES.map(option => <option key={option.value} value={option.value}>{option.label} ({counts[option.value] ?? 0})</option>)}
              </select>
            </label>
            <label className="km-roster-check"><input type="checkbox" checked={hideWithdrawn} onChange={event => setHideWithdrawn(event.target.checked)} />Hide withdrawn</label>
            <label className="km-roster-check"><input type="checkbox" checked={hideAbsent} onChange={event => setHideAbsent(event.target.checked)} />Hide absent</label>
            <button type="button" className="button button-secondary" onClick={clear} disabled={!active}>Clear filters</button>
          </div>
        </details>
        {children}
      </div>
      {active ? (
        <div className="km-roster-active-filters" aria-label="Active filters">
          {query.trim() ? <button type="button" onClick={() => setQuery("")} aria-label="Remove search filter">Search: {query.trim()} ×</button> : null}
          {status !== "all" ? <button type="button" onClick={() => setStatus("all")} aria-label="Remove status filter">{STATUSES.find(option => option.value === status)?.label} ×</button> : null}
          {hideWithdrawn ? <button type="button" onClick={() => setHideWithdrawn(false)} aria-label="Show withdrawn volunteers">Withdrawn hidden ×</button> : null}
          {hideAbsent ? <button type="button" onClick={() => setHideAbsent(false)} aria-label="Show absent volunteers">Absent hidden ×</button> : null}
          <button type="button" onClick={clear}>Clear all</button>
        </div>
      ) : null}
    </div>
  );
}
