"use client";

import { useRef, useState } from "react";

type TimeslotEditorValue = Readonly<{
  id?: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled";
}>;

type EditableTimeslot = TimeslotEditorValue & { clientId: string };

function blankTimeslot(clientId: string): EditableTimeslot {
  return { clientId, label: "", startsAt: "", endsAt: "", status: "scheduled" };
}

export function TimeslotEditor({ initialTimeslots }: { initialTimeslots: TimeslotEditorValue[] }) {
  const [timeslots, setTimeslots] = useState<EditableTimeslot[]>(
    initialTimeslots.length > 0
      ? initialTimeslots.map((timeslot, index) => ({
          ...timeslot,
          clientId: timeslot.id ?? `initial-${index}`,
        }))
      : [blankTimeslot("initial-new-0")],
  );
  const nextClientId = useRef(initialTimeslots.length + 1);

  const serialized = JSON.stringify(
    timeslots.map((timeslot) => ({
      id: timeslot.id,
      label: timeslot.label,
      startsAt: timeslot.startsAt,
      endsAt: timeslot.endsAt,
      status: timeslot.status,
    })),
  );

  function updateTimeslot(clientId: string, updates: Partial<TimeslotEditorValue>) {
    setTimeslots((current) =>
      current.map((timeslot) =>
        timeslot.clientId === clientId ? { ...timeslot, ...updates } : timeslot,
      ),
    );
  }

  function duplicateTimeslot(source: EditableTimeslot) {
    setTimeslots((current) => [
      ...current,
      {
        clientId: `copy-${nextClientId.current++}`,
        label: source.label,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        status: source.status,
      },
    ]);
  }

  return (
    <fieldset className="phaseone-admin-fieldset phaseone-schedule-editor">
      <legend>{timeslots.length === 1 ? "Schedule" : `Schedule · ${timeslots.length} shifts`}</legend>
      <input name="timeslotsJson" type="hidden" value={serialized} />

      <div className="phaseone-timeslot-list">
        {timeslots.map((timeslot, index) => (
          <div className="phaseone-timeslot-card" key={timeslot.clientId}>
            <div className="phaseone-timeslot-heading">
              <strong>{timeslots.length === 1 ? "Event timing" : `Shift ${index + 1}`}</strong>
              {timeslot.status === "cancelled" ? <span className="status-pill">Cancelled</span> : null}
            </div>

            <div className="phaseone-admin-grid">
              <div className="form-field">
                <label htmlFor={`timeslot-start-${timeslot.clientId}`}>Reporting date and time</label>
                <input
                  id={`timeslot-start-${timeslot.clientId}`}
                  onChange={(event) => updateTimeslot(timeslot.clientId, { startsAt: event.target.value })}
                  required
                  type="datetime-local"
                  value={timeslot.startsAt}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`timeslot-end-${timeslot.clientId}`}>End time <span className="muted">(optional)</span></label>
                <input
                  id={`timeslot-end-${timeslot.clientId}`}
                  onChange={(event) => updateTimeslot(timeslot.clientId, { endsAt: event.target.value })}
                  type="datetime-local"
                  value={timeslot.endsAt}
                />
              </div>
            </div>

            {timeslots.length > 1 ? (
              <div className="form-field">
                <label htmlFor={`timeslot-label-${timeslot.clientId}`}>Shift name</label>
                <input
                  id={`timeslot-label-${timeslot.clientId}`}
                  maxLength={120}
                  onChange={(event) => updateTimeslot(timeslot.clientId, { label: event.target.value })}
                  placeholder="Morning"
                  value={timeslot.label}
                />
              </div>
            ) : (
              <input type="hidden" value={timeslot.label} />
            )}

            <details className="phaseone-inline-disclosure" open={timeslot.status === "cancelled"}>
              <summary>More shift options</summary>
              <div className="phaseone-disclosure-body">
                <div className="form-field">
                  <label htmlFor={`timeslot-status-${timeslot.clientId}`}>Status</label>
                  <select
                    id={`timeslot-status-${timeslot.clientId}`}
                    onChange={(event) => updateTimeslot(timeslot.clientId, { status: event.target.value as "scheduled" | "cancelled" })}
                    value={timeslot.status}
                  >
                    <option value="scheduled">Scheduled</option>
                    <option value="cancelled">Cancelled</option>
                  </select>
                </div>
                <div className="actions">
                  <button className="button button-secondary" onClick={() => duplicateTimeslot(timeslot)} type="button">Duplicate shift</button>
                  <button
                    className="button"
                    disabled={timeslots.length === 1}
                    onClick={() => setTimeslots((current) => current.filter(({ clientId }) => clientId !== timeslot.clientId))}
                    type="button"
                  >
                    Remove shift
                  </button>
                </div>
              </div>
            </details>
          </div>
        ))}
      </div>

      <button
        className="button button-secondary"
        onClick={() => setTimeslots((current) => [...current, blankTimeslot(`new-${nextClientId.current++}`)])}
        type="button"
      >
        Add another shift
      </button>
    </fieldset>
  );
}
