"use client";

import { useEffect, useRef, useState } from "react";

const STATUS_OPTIONS = [
  { value: "all", label: "All" },
  { value: "pending", label: "Not arrived" },
  { value: "signed_in", label: "Checked in" },
  { value: "signed_out", label: "Checked out" },
  { value: "withdrawn", label: "Withdrawn" },
  { value: "absent", label: "Absent" },
  { value: "anomaly", label: "Needs review" },
] as const;

type RosterFiltersProps = {
  initialQuery: string;
  initialShownCount: number;
  initialStatus: string;
  timeslotId: string;
};

export function RosterFilters({
  initialQuery,
  initialShownCount,
  initialStatus,
  timeslotId,
}: RosterFiltersProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState(initialQuery);
  const [status, setStatus] = useState(initialStatus);
  const [shownCount, setShownCount] = useState(initialShownCount);

  useEffect(() => {
    const section = rootRef.current?.closest<HTMLElement>(".phaseone-admin-section");
    if (!section) return;

    const normalizedQuery = query.trim().toLowerCase();
    let nextShownCount = 0;

    section
      .querySelectorAll<HTMLElement>(".phaseone-checkin-card[data-roster-filterable='true']")
      .forEach((card) => {
        const matchesStatus = status === "all" || card.dataset.status === status;
        const matchesQuery =
          !normalizedQuery ||
          (card.dataset.filterText ?? "").includes(normalizedQuery);
        const visible = matchesStatus && matchesQuery;

        card.hidden = !visible;
        if (visible) nextShownCount += 1;
      });

    setShownCount(nextShownCount);

    const count = section.querySelector<HTMLElement>("[data-roster-visible-count]");
    if (count) count.textContent = String(nextShownCount);

    const url = new URL(window.location.href);
    url.searchParams.set("timeslot", timeslotId);

    if (query.trim()) {
      url.searchParams.set("q", query.trim());
    } else {
      url.searchParams.delete("q");
    }

    if (status !== "all") {
      url.searchParams.set("status", status);
    } else {
      url.searchParams.delete("status");
    }

    window.history.replaceState(
      window.history.state,
      "",
      `${url.pathname}${url.search}${url.hash}`,
    );
  }, [query, status, timeslotId]);

  const filtersActive = status !== "all" || query.trim().length > 0;

  const clearFilters = () => {
    setQuery("");
    setStatus("all");
  };

  return (
    <div className="phaseone-roster-filter-shell" ref={rootRef}>
      <div className="phaseone-attendance-filters phaseone-roster-filter-controls phaseone-desktop-filters">
        <div className="form-field">
          <label htmlFor="q">Search</label>
          <input
            aria-controls="roster-list"
            id="q"
            name="q"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Name, volunteer ID or contact number"
            type="search"
            value={query}
          />
        </div>
        <div className="form-field">
          <label htmlFor="status">Status</label>
          <select
            aria-controls="roster-list"
            id="status"
            name="status"
            onChange={(event) => setStatus(event.target.value)}
            value={status}
          >
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>

      <details
        className="phaseone-mobile-filter"
        data-active={filtersActive ? "true" : undefined}
      >
        <summary aria-label="Filter roster" title="Filter roster">
          <svg aria-hidden="true" viewBox="0 0 24 24">
            <path d="M4 5h16l-6.25 7.1v5.15l-3.5 1.75v-6.9L4 5Z" />
          </svg>
          <span className="phaseone-mobile-filter-dot" aria-hidden="true" />
        </summary>
        <div className="phaseone-mobile-filter-panel">
          <div className="phaseone-mobile-filter-heading">
            <strong>Filter roster</strong>
            <span className="muted">{shownCount} shown</span>
          </div>
          <div className="phaseone-mobile-filter-form">
            <div className="form-field">
              <label htmlFor="mobile-q">Search</label>
              <input
                aria-controls="roster-list"
                id="mobile-q"
                name="mobile-q"
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Name, ID or contact"
                type="search"
                value={query}
              />
            </div>
            <div className="form-field">
              <label htmlFor="mobile-status">Status</label>
              <select
                aria-controls="roster-list"
                id="mobile-status"
                name="mobile-status"
                onChange={(event) => setStatus(event.target.value)}
                value={status}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="phaseone-mobile-filter-actions">
              <button
                className="button button-secondary"
                disabled={!filtersActive}
                onClick={clearFilters}
                type="button"
              >
                Clear filters
              </button>
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
