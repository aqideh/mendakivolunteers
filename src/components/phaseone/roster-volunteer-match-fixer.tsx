"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  relinkRosterVolunteer,
  searchRosterVolunteerDatabase,
  type RosterVolunteerDatabaseItem,
  type RosterVolunteerRelinkState,
} from "@/app/admin/events/roster-actions";

const initialRelinkState: RosterVolunteerRelinkState = {
  status: "idle",
  message: "",
};

function volunteerDetail(volunteer: RosterVolunteerDatabaseItem): string {
  return [
    volunteer.volunteerCode,
    volunteer.email,
    volunteer.mobile,
    volunteer.age !== null ? `Age ${volunteer.age}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function RosterVolunteerMatchFixer({
  eventId,
  rosterId,
  currentVolunteerCode,
  currentVolunteerName,
  currentContact,
  detailsName,
  needsReview,
}: {
  eventId: string;
  rosterId: string;
  currentVolunteerCode: string | null;
  currentVolunteerName: string;
  currentContact: string | null;
  detailsName?: string;
  needsReview: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = useState(
    currentVolunteerCode ?? currentVolunteerName,
  );
  const [results, setResults] = useState<RosterVolunteerDatabaseItem[]>([]);
  const [selected, setSelected] = useState<RosterVolunteerDatabaseItem | null>(null);
  const [searchMessage, setSearchMessage] = useState("");
  const [relinkState, setRelinkState] = useState(initialRelinkState);
  const [isSearching, startSearchTransition] = useTransition();
  const [isRelinking, startRelinkTransition] = useTransition();

  function search() {
    setSelected(null);
    setRelinkState(initialRelinkState);
    startSearchTransition(async () => {
      const result = await searchRosterVolunteerDatabase({
        eventId,
        query,
      });
      setResults(result.volunteers);
      setSearchMessage(result.message);
    });
  }

  function confirmRelink() {
    if (!selected) return;
    setRelinkState(initialRelinkState);
    startRelinkTransition(async () => {
      const result = await relinkRosterVolunteer({
        eventId,
        rosterId,
        targetVolunteerId: selected.id,
      });
      setRelinkState(result);
      if (result.status === "success") {
        router.refresh();
      }
    });
  }

  return (
    <details
      className="phaseone-attendance-edit phaseone-identity-fix"
      data-needs-review={needsReview ? "true" : undefined}
      name={detailsName}
    >
      <summary>
        <svg
          aria-hidden="true"
          className="phaseone-staff-tool-icon"
          viewBox="0 0 24 24"
        >
          <path d="M15 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM4 20c0-3.4 2.7-6 6-6h2M16.5 14.5l4 4M20.5 14.5l-4 4" />
        </svg>
        <span>{needsReview ? "Fix match" : "Volunteer match"}</span>
      </summary>

      <div className="phaseone-identity-fix-body">
        <div className="phaseone-identity-current">
          <span className="eyebrow">Current roster identity</span>
          <strong>{currentVolunteerName}</strong>
          <span className="muted">
            {[currentVolunteerCode ?? "No KEL ID", currentContact]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </div>

        <div className="form-field">
          <label htmlFor={`match-search-${rosterId}`}>
            Find the correct volunteer
          </label>
          <div className="phaseone-identity-search-row">
            <input
              id={`match-search-${rosterId}`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (query.trim().length >= 2 && !isSearching) search();
                }
              }}
              placeholder="Name, KEL ID, email or mobile"
              type="search"
              value={query}
            />
            <button
              className="button button-secondary"
              disabled={query.trim().length < 2 || isSearching}
              onClick={search}
              type="button"
            >
              {isSearching ? "Searching…" : "Search"}
            </button>
          </div>
        </div>

        {searchMessage ? <p className="muted">{searchMessage}</p> : null}

        {results.length > 0 ? (
          <div className="phaseone-identity-results" role="list">
            {results.map((volunteer) => {
              const active = selected?.id === volunteer.id;
              return (
                <button
                  aria-pressed={active}
                  className="phaseone-identity-result"
                  data-selected={active ? "true" : undefined}
                  key={volunteer.id}
                  onClick={() => setSelected(volunteer)}
                  type="button"
                >
                  <span>
                    <strong>{volunteer.displayName}</strong>
                    <small>{volunteerDetail(volunteer)}</small>
                  </span>
                  <span className="phaseone-identity-select-mark">
                    {active ? "Selected" : "Select"}
                  </span>
                </button>
              );
            })}
          </div>
        ) : null}

        {selected ? (
          <div className="phaseone-identity-confirm">
            <div>
              <span className="eyebrow">Link roster to</span>
              <strong>
                {selected.volunteerCode} · {selected.displayName}
              </strong>
              <p className="muted">
                Attendance and event records stay on this roster entry. If the current KEL ID was created accidentally from this roster and has no independent history, it will be retired safely.
              </p>
            </div>
            <button
              className="button button-primary"
              disabled={isRelinking}
              onClick={confirmRelink}
              type="button"
            >
              {isRelinking ? "Linking…" : "Link volunteer"}
            </button>
          </div>
        ) : null}

        {relinkState.message ? (
          <div
            className={
              relinkState.status === "error"
                ? "notice notice-error"
                : "notice notice-success"
            }
            role={relinkState.status === "error" ? "alert" : "status"}
          >
            {relinkState.message}
          </div>
        ) : null}
      </div>
    </details>
  );
}
