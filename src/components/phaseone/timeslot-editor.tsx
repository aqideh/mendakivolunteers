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
  return {
    clientId,
    label: "",
    startsAt: "",
    endsAt: "",
    status: "scheduled",
  };
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
        ...source,
        id: undefined,
        clientId: `copy-${nextClientId.current++}`,
      },
    ]);
  }

  return (
    <fieldset className="phaseone-admin-fieldset">
      <legend>Schedule</legend>
      <p className="muted">
        Add every reporting timeslot. End time and shift label are optional.
      </p>
      <input name="timeslotsJson" type="hidden" value={serialized} />

      <div className="phaseone-admin-form">
        {timeslots.map((timeslot, index) => (
          <fieldset className="phaseone-admin-fieldset" key={timeslot.clientId}>
            <legend>Timeslot {index + 1}</legend>
            <div className="form-field">
              <label htmlFor={`timeslot-label-${timeslot.clientId}`}>Shift label</label>
              <input
                id={`timeslot-label-${timeslot.clientId}`}
                maxLength={120}
                onChange={(event) =>
                  updateTimeslot(timeslot.clientId, { label: event.target.value })
                }
                placeholder="Morning shift"
                value={timeslot.label}
              />
            </div>
            <div className="phaseone-admin-grid">
              <div className="form-field">
                <label htmlFor={`timeslot-start-${timeslot.clientId}`}>
                  Reporting date and time (Singapore)
                </label>
                <input
                  id={`timeslot-start-${timeslot.clientId}`}
                  onChange={(event) =>
                    updateTimeslot(timeslot.clientId, { startsAt: event.target.value })
                  }
                  required
                  type="datetime-local"
                  value={timeslot.startsAt}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`timeslot-end-${timeslot.clientId}`}>
                  End date and time (Singapore)
                </label>
                <input
                  id={`timeslot-end-${timeslot.clientId}`}
                  onChange={(event) =>
                    updateTimeslot(timeslot.clientId, { endsAt: event.target.value })
                  }
                  type="datetime-local"
                  value={timeslot.endsAt}
                />
              </div>
            </div>
            <div className="form-field">
              <label htmlFor={`timeslot-status-${timeslot.clientId}`}>Status</label>
              <select
                id={`timeslot-status-${timeslot.clientId}`}
                onChange={(event) =>
                  updateTimeslot(timeslot.clientId, {
                    status: event.target.value as "scheduled" | "cancelled",
                  })
                }
                value={timeslot.status}
              >
                <option value="scheduled">Scheduled</option>
                <option value="cancelled">Cancelled</option>
              </select>
            </div>
            <div className="actions">
              <button
                className="button button-secondary"
                onClick={() => duplicateTimeslot(timeslot)}
                type="button"
              >
                Duplicate
              </button>
              <button
                className="button"
                disabled={timeslots.length === 1}
                onClick={() =>
                  setTimeslots((current) =>
                    current.filter(({ clientId }) => clientId !== timeslot.clientId),
                  )
                }
                type="button"
              >
                Remove
              </button>
            </div>
          </fieldset>
        ))}
      </div>

      <button
        className="button button-secondary"
        onClick={() =>
          setTimeslots((current) => [
            ...current,
            blankTimeslot(`new-${nextClientId.current++}`),
          ])
        }
        type="button"
      >
        Add timeslot
      </button>
    </fieldset>
  );
}
