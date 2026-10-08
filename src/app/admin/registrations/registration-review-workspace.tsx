"use client";

import Link from "next/link";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  bulkReviewRegistrations,
  cancelRegistration,
  reviewRegistration,
} from "./actions";

export type RegistrationSignal = {
  key: string;
  label: string;
  tone: "neutral" | "info" | "warning" | "danger";
};

export type RegistrationShiftView = {
  id: string;
  label: string;
  dateLabel: string;
  timeLabel: string;
  capacity: number | null;
  reserved: number;
  confirmed: number;
  left: number | null;
};

export type RegistrationReviewRow = {
  id: string;
  eventId: string;
  eventTitle: string;
  status: string;
  statusLabel: string;
  submittedLabel: string;
  submittedAt: string;
  reviewedLabel: string | null;
  volunteerName: string;
  volunteerCode: string | null;
  email: string | null;
  mobile: string | null;
  identityResolved: boolean;
  identityReviewHref: string | null;
  shifts: RegistrationShiftView[];
  shiftSummary: string;
  capacitySummary: string;
  signals: RegistrationSignal[];
  reviewNote: string | null;
  canReview: boolean;
  canCancel: boolean;
  programmeHref: string | null;
  eventOpsHref: string | null;
};

export type RegistrationCapacityItem = {
  id: string;
  eventTitle: string;
  label: string;
  dateLabel: string;
  timeLabel: string;
  capacity: number | null;
  reserved: number;
  pending: number;
  confirmed: number;
  left: number | null;
};

type Props = {
  rows: RegistrationReviewRow[];
  capacityItems: RegistrationCapacityItem[];
  eventFilter: string | undefined;
};

type StatusFilter =
  | "pending"
  | "waitlisted"
  | "confirmed"
  | "rejected"
  | "closed";

type SortMode = "oldest" | "newest" | "name";

const tabs: Array<{ value: StatusFilter; label: string }> = [
  { value: "pending", label: "Pending" },
  { value: "waitlisted", label: "Waitlisted" },
  { value: "confirmed", label: "Confirmed" },
  { value: "rejected", label: "Not confirmed" },
  { value: "closed", label: "Closed" },
];

function matchesStatus(row: RegistrationReviewRow, status: StatusFilter) {
  if (status === "closed") {
    return row.status === "withdrawn" || row.status === "cancelled";
  }
  return row.status === status;
}

function isTypingTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName.toLowerCase();
  return (
    tag === "input" ||
    tag === "textarea" ||
    tag === "select" ||
    tag === "button" ||
    target.isContentEditable
  );
}

function iconForDecision(decision: "confirmed" | "waitlisted" | "rejected") {
  if (decision === "confirmed") return "✓";
  if (decision === "waitlisted") return "◷";
  return "×";
}

function labelForDecision(decision: "confirmed" | "waitlisted" | "rejected") {
  if (decision === "confirmed") return "Confirm";
  if (decision === "waitlisted") return "Waitlist";
  return "Reject";
}

export function RegistrationReviewWorkspace({
  rows,
  capacityItems,
  eventFilter,
}: Props) {
  const [status, setStatus] = useState<StatusFilter>("pending");
  const [query, setQuery] = useState("");
  const [programme, setProgramme] = useState("all");
  const [signal, setSignal] = useState("all");
  const [sort, setSort] = useState<SortMode>("oldest");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [activeId, setActiveId] = useState<string | null>(null);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const searchRef = useRef<HTMLInputElement>(null);

  const programmes = useMemo(
    () =>
      Array.from(
        new Set([
          ...rows.map((row) => row.eventTitle),
          ...capacityItems.map((item) => item.eventTitle),
        ]),
      ).sort((a, b) => a.localeCompare(b)),
    [rows, capacityItems],
  );

  const counts = useMemo(() => {
    const result: Record<StatusFilter, number> = {
      pending: 0,
      waitlisted: 0,
      confirmed: 0,
      rejected: 0,
      closed: 0,
    };
    for (const row of rows) {
      if (row.status === "pending") result.pending += 1;
      else if (row.status === "waitlisted") result.waitlisted += 1;
      else if (row.status === "confirmed") result.confirmed += 1;
      else if (row.status === "rejected") result.rejected += 1;
      else if (row.status === "withdrawn" || row.status === "cancelled") {
        result.closed += 1;
      }
    }
    return result;
  }, [rows]);

  const visibleRows = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    const filtered = rows.filter((row) => {
      if (!matchesStatus(row, status)) return false;
      if (programme !== "all" && row.eventTitle !== programme) return false;
      if (signal !== "all") {
        if (signal === "attention" && row.signals.length === 0) return false;
        if (
          signal !== "attention" &&
          !row.signals.some((item) => item.key === signal)
        ) {
          return false;
        }
      }
      if (!normalizedQuery) return true;
      return [
        row.volunteerName,
        row.volunteerCode,
        row.email,
        row.mobile,
        row.eventTitle,
        row.shiftSummary,
      ]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery));
    });

    return filtered.sort((left, right) => {
      if (sort === "name") {
        return left.volunteerName.localeCompare(right.volunteerName);
      }
      const delta =
        new Date(left.submittedAt).getTime() -
        new Date(right.submittedAt).getTime();
      return sort === "newest" ? -delta : delta;
    });
  }, [rows, status, programme, signal, query, sort]);

  const activeRow = activeId
    ? rows.find((row) => row.id === activeId) ?? null
    : null;

  const visibleSelectableIds = visibleRows
    .filter((row) => row.canReview)
    .map((row) => row.id);
  const selectedRows = rows.filter((row) => selected.has(row.id));
  const allVisibleSelected =
    visibleSelectableIds.length > 0 &&
    visibleSelectableIds.every((id) => selected.has(id));
  const selectedPerShift = new Map<string, number>();
  for (const row of selectedRows) {
    for (const shift of row.shifts) {
      selectedPerShift.set(shift.id, (selectedPerShift.get(shift.id) ?? 0) + 1);
    }
  }
  const identitiesReady = selectedRows.every((row) => row.canReview && row.identityResolved);
  const bulkFitsCapacity = selectedRows.every((row) =>
    row.shifts.every((shift) =>
      shift.left === null || (selectedPerShift.get(shift.id) ?? 0) <= shift.left,
    ),
  );
  const canBulkConfirm = selectedRows.length > 0 && identitiesReady && bulkFitsCapacity;

  const returnTo = eventFilter
    ? "/admin/registrations?event=" + encodeURIComponent(eventFilter)
    : "/admin/registrations";

  function setStatusAndClear(value: StatusFilter) {
    setStatus(value);
    setSelected(new Set());
    setFocusedIndex(0);
  }

  function toggleSelected(id: string) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);
      if (allVisibleSelected) {
        visibleSelectableIds.forEach((id) => next.delete(id));
      } else {
        visibleSelectableIds.forEach((id) => next.add(id));
      }
      return next;
    });
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (isTypingTarget(event.target)) return;

      if (event.key === "/") {
        event.preventDefault();
        searchRef.current?.focus();
        return;
      }

      if (visibleRows.length === 0) return;

      if (event.key.toLowerCase() === "j") {
        event.preventDefault();
        setFocusedIndex((current) => {
          const next = Math.min(current + 1, visibleRows.length - 1);
          const row = visibleRows[next];
          if (row) document.getElementById("registration-row-" + row.id)?.focus();
          return next;
        });
      } else if (event.key.toLowerCase() === "k") {
        event.preventDefault();
        setFocusedIndex((current) => {
          const next = Math.max(current - 1, 0);
          const row = visibleRows[next];
          if (row) document.getElementById("registration-row-" + row.id)?.focus();
          return next;
        });
      } else if (event.key === " " && visibleRows[focusedIndex]?.canReview) {
        event.preventDefault();
        toggleSelected(visibleRows[focusedIndex].id);
      } else if (event.key === "Enter") {
        const row = visibleRows[focusedIndex];
        if (row) {
          event.preventDefault();
          setActiveId(row.id);
        }
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [focusedIndex, visibleRows]);

  return (
    <section className="registration-review-workspace" aria-label="Volunteer registrations">
      {capacityItems.length > 0 ? (
        <div className="registration-capacity-strip" aria-label="Shift capacity">
          {capacityItems.map((item) => {
            // Only confirmed placements contribute to recruitment completion.
            const ratio = item.capacity !== null && item.capacity > 0
              ? Math.min(100, Math.round((item.confirmed / item.capacity) * 100))
              : 0;
            const state = item.capacity === null
              ? "uncapped"
              : item.capacity <= 0
                ? "unavailable"
                : ratio >= 100
                  ? "complete"
                  : ratio < 50
                    ? "low"
                    : "partial";
            return (
              <article className="registration-capacity-card" data-state={state} key={item.id}>
                <div className="registration-capacity-title">
                  <span>{item.eventTitle}</span>
                  <strong>
                    {item.capacity === null
                      ? item.confirmed + " confirmed · No cap"
                      : item.confirmed + " / " + item.capacity + " confirmed"}
                  </strong>
                </div>
                <p>
                  {item.label} · {item.dateLabel} · {item.timeLabel}
                </p>
                {item.capacity === null ? (
                  <div className="registration-capacity-meter registration-capacity-meter-uncapped" aria-label="No recruitment target set" />
                ) : (
                  <div
                    className="registration-capacity-meter"
                    aria-label={item.confirmed + " of " + item.capacity + " places confirmed"}
                  >
                    <span style={{ width: ratio + "%" }} />
                  </div>
                )}
                <div className="registration-capacity-meta">
                  <span>{item.reserved === 0 ? "No registrations yet" : item.pending + " pending · " + item.confirmed + " confirmed"}</span>
                  <strong>
                    {state === "uncapped"
                      ? "No cap"
                      : state === "complete"
                        ? "Fully recruited"
                        : state === "unavailable"
                          ? "No capacity"
                          : item.left + " to confirm"}
                  </strong>
                </div>
                {item.capacity !== null && item.reserved > item.capacity ? (
                  <p className="registration-capacity-overflow">
                    {item.reserved} applications for {item.capacity} places. Review pending applications to allocate places.
                  </p>
                ) : item.capacity !== null && item.reserved >= item.capacity && item.left !== null && item.left > 0 ? (
                  <p className="registration-capacity-overflow">New applications are waitlisted while pending places are held.</p>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

      <div className="registration-review-panel">
        <div className="registration-toolbar">
          <div className="registration-tabs" role="tablist" aria-label="Registration status">
            {tabs.map((tab) => (
              <button
                aria-selected={status === tab.value}
                className="registration-tab"
                data-active={status === tab.value ? "true" : "false"}
                key={tab.value}
                onClick={() => setStatusAndClear(tab.value)}
                role="tab"
                type="button"
              >
                {tab.label}
                <span>{counts[tab.value]}</span>
              </button>
            ))}
          </div>

          <div className="registration-filter-row">
            <label className="registration-search">
              <span className="sr-only">Search registrations</span>
              <span aria-hidden="true">⌕</span>
              <input
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, email, phone"
                ref={searchRef}
                type="search"
                value={query}
              />
              <kbd>/</kbd>
            </label>

            <label>
              <span className="sr-only">Programme</span>
              <select
                aria-label="Programme"
                onChange={(event) => {
                  setProgramme(event.target.value);
                  setSelected(new Set());
                }}
                value={programme}
              >
                <option value="all">All programmes</option>
                {programmes.map((name) => (
                  <option key={name} value={name}>{name}</option>
                ))}
              </select>
            </label>

            <label>
              <span className="sr-only">Signals</span>
              <select
                aria-label="Signals"
                onChange={(event) => {
                  setSignal(event.target.value);
                  setSelected(new Set());
                }}
                value={signal}
              >
                <option value="all">All signals</option>
                <option value="attention">Needs attention</option>
                <option value="identity">Identity review</option>
                <option value="mobile">Missing phone</option>
                <option value="duplicate">Multiple programmes</option>
                <option value="clash">Schedule clash</option>
                <option value="capacity">Capacity risk</option>
              </select>
            </label>

            <label>
              <span className="sr-only">Sort registrations</span>
              <select
                aria-label="Sort registrations"
                onChange={(event) => setSort(event.target.value as SortMode)}
                value={sort}
              >
                <option value="oldest">Oldest first</option>
                <option value="newest">Newest first</option>
                <option value="name">Name A–Z</option>
              </select>
            </label>
          </div>
        </div>

        {selected.size > 0 ? (
          <form
            action={bulkReviewRegistrations}
            className="registration-bulk-bar"
            onSubmit={(event) => {
              const nativeEvent = event.nativeEvent as SubmitEvent;
              const submitter = nativeEvent.submitter as HTMLButtonElement | null;
              if (
                submitter?.value === "rejected" &&
                !window.confirm(
                  "Reject the selected registrations? This removes them from the active review queue.",
                )
              ) {
                event.preventDefault();
              }
            }}
          >
            {Array.from(selected).map((id) => (
              <input key={id} name="registrationIds" type="hidden" value={id} />
            ))}
            <input name="returnTo" type="hidden" value={returnTo} />
            <strong>{selected.size} selected</strong>
            <span className="registration-bulk-actions">
              <button
                className="registration-bulk-button"
                disabled={!canBulkConfirm}
                name="decision"
                type="submit"
                value="confirmed"
              >
                Confirm
              </button>
              <button
                className="registration-bulk-button"
                name="decision"
                type="submit"
                value="waitlisted"
              >
                Waitlist
              </button>
              <button
                className="registration-bulk-button registration-bulk-button-danger"
                name="decision"
                type="submit"
                value="rejected"
              >
                Reject
              </button>
            </span>
            {!canBulkConfirm ? (
              <span className="registration-bulk-hint">
                {!identitiesReady
                  ? "Resolve all selected volunteer identities before confirming."
                  : "Selection exceeds the available confirmed places. Select fewer volunteers."}
              </span>
            ) : null}
            <button
              className="registration-clear-selection"
              onClick={() => setSelected(new Set())}
              type="button"
            >
              Clear
            </button>
          </form>
        ) : null}

        <div className="registration-table" role="table">
          <div className="registration-table-head" role="row">
            <div role="columnheader">
              <input
                aria-label={allVisibleSelected ? "Clear visible selection" : "Select visible registrations"}
                checked={allVisibleSelected}
                disabled={visibleSelectableIds.length === 0}
                onChange={toggleAllVisible}
                type="checkbox"
              />
            </div>
            <div role="columnheader">Volunteer</div>
            <div role="columnheader">Programme & shift</div>
            <div role="columnheader">Signals</div>
            <div role="columnheader">Action</div>
          </div>

          {visibleRows.map((row, index) => (
            <div
              aria-label={row.volunteerName + ", " + row.eventTitle}
              className="registration-table-row"
              data-selected={selected.has(row.id) ? "true" : "false"}
              id={"registration-row-" + row.id}
              key={row.id}
              onFocus={() => setFocusedIndex(index)}
              role="row"
              tabIndex={-1}
            >
              <div className="registration-select-cell" role="cell">
                {row.canReview ? (
                  <input
                    aria-label={"Select " + row.volunteerName}
                    checked={selected.has(row.id)}
                    onChange={() => toggleSelected(row.id)}
                    type="checkbox"
                  />
                ) : (
                  <span />
                )}
              </div>

              <div className="registration-volunteer-cell" role="cell">
                <button
                  className="registration-name-button"
                  onClick={() => setActiveId(row.id)}
                  type="button"
                >
                  {row.volunteerName}
                </button>
                <div className="registration-row-meta">
                  {row.volunteerCode ? <span>{row.volunteerCode}</span> : null}
                  <span>{row.submittedLabel}</span>
                  {row.mobile ? <span>{row.mobile}</span> : null}
                </div>
              </div>

              <div className="registration-programme-cell" role="cell">
                <strong>{row.eventTitle}</strong>
                <span>{row.shiftSummary}</span>
                <span className="registration-capacity-inline">{row.capacitySummary}</span>
              </div>

              <div className="registration-signals-cell" role="cell">
                {row.signals.length ? (
                  row.signals.map((item) => (
                    <span
                      className="registration-signal"
                      data-tone={item.tone}
                      key={item.key}
                    >
                      {item.label}
                    </span>
                  ))
                ) : (
                  <span className="registration-signal-empty">—</span>
                )}
              </div>

              <div className="registration-actions-cell" role="cell">
                {row.canReview ? (
                  <>
                    {row.identityResolved ? (
                      <QuickDecisionForm
                        decision="confirmed"
                        eventId={row.eventId}
                        registrationId={row.id}
                      />
                    ) : null}
                    <QuickDecisionForm
                      decision="waitlisted"
                      eventId={row.eventId}
                      registrationId={row.id}
                    />
                    <QuickDecisionForm
                      decision="rejected"
                      eventId={row.eventId}
                      registrationId={row.id}
                    />
                  </>
                ) : (
                  <span className="status-pill" data-state={row.status}>
                    {row.statusLabel}
                  </span>
                )}
                <button
                  aria-label={"Open details for " + row.volunteerName}
                  className="registration-icon-button registration-detail-button"
                  onClick={() => setActiveId(row.id)}
                  title="Details"
                  type="button"
                >
                  <span aria-hidden="true">›</span>
                </button>
              </div>
            </div>
          ))}

          {visibleRows.length === 0 ? (
            <div className="registration-empty-state">
              No registrations match this view.
            </div>
          ) : null}
        </div>

        <div className="registration-table-footer">
          <span>
            Showing {visibleRows.length} of {counts[status]} {tabs.find((tab) => tab.value === status)?.label.toLowerCase()} registrations
          </span>
          <span className="registration-keyboard-hint">
            J/K move · Space select · Enter details
          </span>
        </div>
      </div>

      {activeRow ? (
        <div
          aria-label="Registration details"
          aria-modal="true"
          className="registration-drawer-backdrop"
          onMouseDown={(event) => {
            if (event.currentTarget === event.target) setActiveId(null);
          }}
          role="dialog"
        >
          <aside className="registration-drawer">
            <header className="registration-drawer-header">
              <div>
                <span className="registration-drawer-kicker">
                  {activeRow.volunteerCode ?? "Registration"}
                </span>
                <h2>{activeRow.volunteerName}</h2>
                <p>{activeRow.email ?? "No email"} · {activeRow.mobile ?? "No mobile"}</p>
              </div>
              <button
                aria-label="Close registration details"
                className="registration-drawer-close"
                onClick={() => setActiveId(null)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="registration-drawer-body">
              <section className="registration-drawer-section">
                <div className="registration-drawer-section-title">
                  <h3>{activeRow.eventTitle}</h3>
                  <span className="status-pill" data-state={activeRow.status}>
                    {activeRow.statusLabel}
                  </span>
                </div>
                <dl className="registration-detail-list">
                  <div>
                    <dt>Submitted</dt>
                    <dd>{activeRow.submittedLabel}</dd>
                  </div>
                  {activeRow.reviewedLabel ? (
                    <div>
                      <dt>Reviewed</dt>
                      <dd>{activeRow.reviewedLabel}</dd>
                    </div>
                  ) : null}
                  <div>
                    <dt>Capacity</dt>
                    <dd>{activeRow.capacitySummary}</dd>
                  </div>
                </dl>
              </section>

              <section className="registration-drawer-section">
                <h3>Selected shifts</h3>
                <div className="registration-shift-list">
                  {activeRow.shifts.map((shift) => (
                    <div className="registration-shift-item" key={shift.id}>
                      <div>
                        <strong>{shift.label}</strong>
                        <span>{shift.dateLabel} · {shift.timeLabel}</span>
                      </div>
                      <span>
                        {shift.capacity === null
                          ? "No cap"
                          : shift.left !== null && shift.left <= 0
                            ? "Confirmed full"
                            : shift.left + " available to confirm"}
                      </span>
                    </div>
                  ))}
                </div>
              </section>

              {activeRow.signals.length > 0 ? (
                <section className="registration-drawer-section">
                  <h3>Signals</h3>
                  <div className="registration-drawer-signals">
                    {activeRow.signals.map((item) => (
                      <span
                        className="registration-signal"
                        data-tone={item.tone}
                        key={item.key}
                      >
                        {item.label}
                      </span>
                    ))}
                  </div>
                </section>
              ) : null}

              {!activeRow.identityResolved ? (
                <div className="notice">
                  Canonical volunteer identity must be resolved before confirmation.
                  {activeRow.identityReviewHref ? (
                    <div className="actions">
                      <Link className="text-link" href={activeRow.identityReviewHref}>
                        Open identity review
                      </Link>
                    </div>
                  ) : null}
                </div>
              ) : null}

              {activeRow.canReview ? (
                <form action={reviewRegistration} className="registration-review-form">
                  <input name="registrationId" type="hidden" value={activeRow.id} />
                  <input name="eventId" type="hidden" value={activeRow.eventId} />
                  <label className="form-field">
                    <span>Staff note <small>(optional)</small></span>
                    <textarea
                      defaultValue={activeRow.reviewNote ?? ""}
                      maxLength={1000}
                      name="note"
                      rows={3}
                    />
                  </label>
                  <div className="registration-drawer-actions">
                    {activeRow.identityResolved ? (
                      <button
                        className="button button-primary"
                        name="decision"
                        type="submit"
                        value="confirmed"
                      >
                        Confirm
                      </button>
                    ) : null}
                    <button
                      className="button button-secondary"
                      name="decision"
                      type="submit"
                      value="waitlisted"
                    >
                      Waitlist
                    </button>
                    <button
                      className="button registration-reject-button"
                      name="decision"
                      type="submit"
                      value="rejected"
                    >
                      Reject
                    </button>
                  </div>
                </form>
              ) : activeRow.reviewNote ? (
                <section className="registration-drawer-section">
                  <h3>Staff note</h3>
                  <p>{activeRow.reviewNote}</p>
                </section>
              ) : null}

              <div className="registration-drawer-links">
                {activeRow.programmeHref ? (
                  <Link className="text-link" href={activeRow.programmeHref}>
                    Open programme
                  </Link>
                ) : null}
                {activeRow.eventOpsHref ? (
                  <Link className="text-link" href={activeRow.eventOpsHref}>
                    Open Event Operations
                  </Link>
                ) : null}
              </div>

              {activeRow.canCancel ? (
                <details className="registration-cancel-disclosure">
                  <summary>Cancel registration</summary>
                  <form action={cancelRegistration}>
                    <input name="registrationId" type="hidden" value={activeRow.id} />
                    <input name="eventId" type="hidden" value={activeRow.eventId} />
                    <label className="form-field">
                      <span>Cancellation reason</span>
                      <textarea
                        maxLength={1000}
                        minLength={3}
                        name="reason"
                        required
                        rows={2}
                      />
                    </label>
                    <button className="button button-secondary" type="submit">
                      Cancel registration
                    </button>
                  </form>
                </details>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}
    </section>
  );
}

function QuickDecisionForm({
  registrationId,
  eventId,
  decision,
}: {
  registrationId: string;
  eventId: string;
  decision: "confirmed" | "waitlisted" | "rejected";
}) {
  const label = labelForDecision(decision);
  return (
    <form action={reviewRegistration}>
      <input name="registrationId" type="hidden" value={registrationId} />
      <input name="eventId" type="hidden" value={eventId} />
      <input name="note" type="hidden" value="" />
      <button
        aria-label={label}
        className="registration-icon-button"
        data-decision={decision}
        name="decision"
        title={label}
        type="submit"
        value={decision}
      >
        <span aria-hidden="true">{iconForDecision(decision)}</span>
        <span className="registration-action-label">{label}</span>
      </button>
    </form>
  );
}
