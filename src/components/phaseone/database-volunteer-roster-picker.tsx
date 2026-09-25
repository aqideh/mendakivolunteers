"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  addDatabaseVolunteersToRoster,
  searchRosterVolunteerDatabase,
  type DatabaseRosterAddState,
  type RosterVolunteerDatabaseItem,
  type RosterVolunteerDatabaseSearchState,
} from "@/app/admin/events/roster-actions";

type RosterTimeslot = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
}>;

const initialSearchState: RosterVolunteerDatabaseSearchState = {
  status: "idle",
  message: "",
  volunteers: [],
};

const initialAddState: DatabaseRosterAddState = {
  status: "idle",
  message: "",
};

function singaporeDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(new Date(value));
}

function timeslotLabel(timeslot: RosterTimeslot): string {
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  const time = end ? `${start}–${end}` : start;
  return `${singaporeDate(timeslot.starts_at)} · ${timeslot.label?.trim() || time}${timeslot.label?.trim() ? ` · ${time}` : ""}`;
}

function volunteerDetail(volunteer: RosterVolunteerDatabaseItem): string {
  const details = [volunteer.volunteerCode];
  if (volunteer.email) details.push(volunteer.email);
  if (volunteer.mobile) details.push(volunteer.mobile);
  return details.join(" · ");
}

export function DatabaseVolunteerRosterPicker({
  eventId,
  timeslots,
}: {
  eventId: string;
  timeslots: readonly RosterTimeslot[];
}) {
  const router = useRouter();
  const activeTimeslots = useMemo(
    () => timeslots.filter((timeslot) => timeslot.status !== "cancelled"),
    [timeslots],
  );
  const [query, setQuery] = useState("");
  const [searchState, setSearchState] = useState(initialSearchState);
  const [addState, setAddState] = useState(initialAddState);
  const [selectedVolunteers, setSelectedVolunteers] = useState<string[]>([]);
  const [selectedTimeslots, setSelectedTimeslots] = useState<string[]>(
    activeTimeslots.length === 1 ? [activeTimeslots[0]!.id] : [],
  );
  const [isSearching, startSearchTransition] = useTransition();
  const [isAdding, startAddTransition] = useTransition();

  function search() {
    setAddState(initialAddState);
    startSearchTransition(async () => {
      const result = await searchRosterVolunteerDatabase({
        eventId,
        query,
      });
      setSearchState(result);
      setSelectedVolunteers([]);
    });
  }

  function toggleVolunteer(id: string) {
    setSelectedVolunteers((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleTimeslot(id: string) {
    setSelectedTimeslots((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function addSelected() {
    setAddState(initialAddState);
    startAddTransition(async () => {
      const result = await addDatabaseVolunteersToRoster({
        eventId,
        timeslotIds: selectedTimeslots,
        volunteerIds: selectedVolunteers,
      });
      setAddState(result);

      if (result.status === "success") {
        setSelectedVolunteers([]);
        router.refresh();
      }
    });
  }

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h3>Add from volunteer database</h3>
          <p className="muted">
            Search existing volunteers and assign them directly to this event roster.
            Their canonical KELUARGA volunteer record will be linked automatically.
          </p>
        </div>
      </div>

      <div className="phaseone-admin-form">
        <div className="form-field">
          <label htmlFor={`database-volunteer-search-${eventId}`}>
            Search volunteer database
          </label>
          <div className="actions">
            <input
              id={`database-volunteer-search-${eventId}`}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  if (query.trim().length >= 2 && !isSearching) search();
                }
              }}
              placeholder="Name, KELUARGA ID, email or mobile"
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

        {searchState.message ? (
          <p
            className={
              searchState.status === "error" ? "notice notice-error" : "muted"
            }
            role={searchState.status === "error" ? "alert" : "status"}
          >
            {searchState.message}
          </p>
        ) : null}

        {searchState.volunteers.length > 0 ? (
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th aria-label="Select volunteer" />
                  <th>Volunteer</th>
                  <th>Details</th>
                  <th>Age</th>
                </tr>
              </thead>
              <tbody>
                {searchState.volunteers.map((volunteer) => (
                  <tr key={volunteer.id}>
                    <td>
                      <input
                        aria-label={`Select ${volunteer.displayName}`}
                        checked={selectedVolunteers.includes(volunteer.id)}
                        onChange={() => toggleVolunteer(volunteer.id)}
                        type="checkbox"
                      />
                    </td>
                    <td>
                      <strong>{volunteer.displayName}</strong>
                    </td>
                    <td>{volunteerDetail(volunteer)}</td>
                    <td>{volunteer.age ?? "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        <div className="form-field">
          <label>Assign to shift</label>
          {activeTimeslots.length === 0 ? (
            <p className="notice notice-error">
              Add an active event shift before assigning volunteers.
            </p>
          ) : (
            <div className="phaseone-compact-list">
              {activeTimeslots.map((timeslot) => (
                <label key={timeslot.id}>
                  <input
                    checked={selectedTimeslots.includes(timeslot.id)}
                    onChange={() => toggleTimeslot(timeslot.id)}
                    type="checkbox"
                  />{" "}
                  {timeslotLabel(timeslot)}
                </label>
              ))}
            </div>
          )}
        </div>

        {addState.message ? (
          <div
            className={
              addState.status === "error"
                ? "notice notice-error"
                : "notice notice-success"
            }
            role={addState.status === "error" ? "alert" : "status"}
          >
            {addState.message}
          </div>
        ) : null}

        <div className="actions">
          <button
            className="button button-primary"
            disabled={
              isAdding ||
              selectedVolunteers.length === 0 ||
              selectedTimeslots.length === 0
            }
            onClick={addSelected}
            type="button"
          >
            {isAdding
              ? "Adding…"
              : selectedVolunteers.length === 0
                ? "Select volunteers to add"
                : `Add ${selectedVolunteers.length} selected volunteer${selectedVolunteers.length === 1 ? "" : "s"}`}
          </button>
          {selectedVolunteers.length > 0 ? (
            <span className="muted">
              {selectedVolunteers.length} selected · {selectedTimeslots.length} shift
              {selectedTimeslots.length === 1 ? "" : "s"}
            </span>
          ) : null}
        </div>
      </div>
    </div>
  );
}
