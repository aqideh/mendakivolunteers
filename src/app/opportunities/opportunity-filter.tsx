"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type OpportunityFilterProps = Readonly<{
  categories: string[];
}>;

function normalise(value: string) {
  return value.trim().toLocaleLowerCase("en-SG");
}

export function OpportunityFilter({ categories }: OpportunityFilterProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [date, setDate] = useState("");
  const [resultCount, setResultCount] = useState<number | null>(null);

  const hasFilters = Boolean(search.trim() || category || date);

  useEffect(() => {
    function updateVisibility() {
      setVisible(window.scrollY >= window.innerHeight);
    }

    updateVisibility();
    window.addEventListener("scroll", updateVisibility, { passive: true });
    window.addEventListener("resize", updateVisibility);

    return () => {
      window.removeEventListener("scroll", updateVisibility);
      window.removeEventListener("resize", updateVisibility);
    };
  }, []);

  const filterKey = useMemo(
    () => `${normalise(search)}|${category}|${date}`,
    [search, category, date],
  );

  useEffect(() => {
    const cards = Array.from(
      document.querySelectorAll<HTMLElement>("[data-opportunity-filter-card]"),
    );

    const searchTerm = normalise(search);
    let matches = 0;

    cards.forEach((card) => {
      const searchable = normalise(card.dataset.search ?? "");
      const cardCategory = card.dataset.category ?? "";
      const startsAt = card.dataset.startsAt ?? "";
      const endsAt = card.dataset.endsAt || startsAt;

      const matchesSearch = !searchTerm || searchable.includes(searchTerm);
      const matchesCategory = !category || cardCategory === category;
      const matchesDate = !date || (startsAt.slice(0, 10) <= date && endsAt.slice(0, 10) >= date);
      const show = matchesSearch && matchesCategory && matchesDate;

      card.hidden = !show;
      if (show) matches += 1;
    });

    setResultCount(matches);

    const emptyState = document.getElementById("opportunity-filter-empty");
    if (emptyState) {
      emptyState.hidden = matches > 0 || cards.length === 0;
    }
  }, [filterKey, search, category, date]);

  function clearFilters() {
    setSearch("");
    setCategory("");
    setDate("");
  }

  return (
    <>
      <button
        className="phaseone-opportunity-filter-fab"
        type="button"
        aria-label="Filter opportunities"
        aria-haspopup="dialog"
        data-visible={visible ? "true" : "false"}
        onClick={() => dialogRef.current?.showModal()}
      >
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          width="22"
          height="22"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 6h16" />
          <path d="M7 12h10" />
          <path d="M10 18h4" />
        </svg>
        {hasFilters ? <span className="phaseone-opportunity-filter-dot" /> : null}
      </button>

      <dialog
        ref={dialogRef}
        className="phaseone-opportunity-filter-dialog"
        aria-labelledby="opportunity-filter-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            dialogRef.current?.close();
          }
        }}
      >
        <div className="phaseone-opportunity-filter-panel">
          <div className="phaseone-opportunity-filter-heading">
            <div>
              <h2 id="opportunity-filter-title">Filter opportunities</h2>
              <p>
                {resultCount === null
                  ? "Search upcoming opportunities."
                  : `${resultCount} ${resultCount === 1 ? "opportunity" : "opportunities"} shown`}
              </p>
            </div>
            <button
              className="phaseone-opportunity-filter-close"
              type="button"
              aria-label="Close filters"
              onClick={() => dialogRef.current?.close()}
            >
              ×
            </button>
          </div>

          <div className="phaseone-opportunity-filter-fields">
            <label className="form-field">
              <span>Search</span>
              <input
                type="search"
                value={search}
                placeholder="Search opportunities"
                onChange={(event) => setSearch(event.target.value)}
              />
            </label>

            <label className="form-field">
              <span>Category</span>
              <select
                value={category}
                onChange={(event) => setCategory(event.target.value)}
              >
                <option value="">All categories</option>
                {categories.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>

            <label className="form-field">
              <span>Date</span>
              <input
                type="date"
                value={date}
                onChange={(event) => setDate(event.target.value)}
              />
            </label>
          </div>

          <div className="phaseone-opportunity-filter-actions">
            <button
              className="button button-secondary"
              type="button"
              disabled={!hasFilters}
              onClick={clearFilters}
            >
              Clear
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => dialogRef.current?.close()}
            >
              Show opportunities
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}
