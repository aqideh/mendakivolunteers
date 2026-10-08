"use client";

import { useRef, useState } from "react";

export type TimeslotEditorValue = Readonly<{
  id?: string;
  label: string;
  startsAt: string;
  endsAt: string;
  status: "scheduled" | "cancelled";
  registrationCapacity: number | null;
}>;

type EditableTimeslot = TimeslotEditorValue & { clientId: string };

function blankTimeslot(clientId: string): EditableTimeslot {
  return { clientId, label: "", startsAt: "", endsAt: "", status: "scheduled", registrationCapacity: null };
}

function displayTiming(value: string): string {
  if (!value) return "Set reporting time";
  const timestamp = new Date(value);
  if (Number.isNaN(timestamp.getTime())) return "Set reporting time";
  return timestamp.toLocaleString("en-SG", {
    weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true,
  });
}

export function TimeslotEditor({
  initialTimeslots,
  onChange,
}: {
  initialTimeslots: TimeslotEditorValue[];
  onChange?: (timeslots: TimeslotEditorValue[]) => void;
}) {
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
    timeslots.map(({ clientId: _clientId, ...timeslot }) => {
      void _clientId;
      return timeslot;
    }),
  );

  function commit(next: EditableTimeslot[]) {
    setTimeslots(next);
    onChange?.(next.map(({ clientId: _clientId, ...timeslot }) => {
      void _clientId;
      return timeslot;
    }));
  }

  function updateTimeslot(clientId: string, updates: Partial<TimeslotEditorValue>) {
    commit(timeslots.map((timeslot) =>
      timeslot.clientId === clientId ? { ...timeslot, ...updates } : timeslot,
    ));
  }

  function duplicateTimeslot(source: EditableTimeslot) {
    commit([
      ...timeslots,
      {
        clientId: `copy-${nextClientId.current++}`,
        label: source.label,
        startsAt: source.startsAt,
        endsAt: source.endsAt,
        status: "scheduled",
        registrationCapacity: source.registrationCapacity,
      },
    ]);
  }

  return (
    <fieldset className="phaseone-admin-fieldset phaseone-schedule-editor km-shift-editor">
      <legend>Schedule and shifts</legend>
      <p className="muted">Add the reporting dates and capacity for each shift. Capacity is used when confirming registrations.</p>
      <input name="timeslotsJson" type="hidden" value={serialized} />
      <div className="phaseone-timeslot-list">
        {timeslots.map((timeslot, index) => (
          <div className="phaseone-timeslot-card km-shift-card" key={timeslot.clientId}>
            <div className="phaseone-timeslot-heading km-shift-card-heading">
              <div>
                <strong>Shift {index + 1}{timeslot.label ? ` · ${timeslot.label}` : ""}</strong>
                <p className="muted km-shift-meta">
                  {displayTiming(timeslot.startsAt)} · {timeslot.registrationCapacity == null ? "Unlimited capacity" : `Capacity ${timeslot.registrationCapacity}`}
                </p>
              </div>
              {timeslot.status === "cancelled" ? <span className="status-pill">Cancelled</span> : null}
            </div>
            <div className="phaseone-admin-grid km-shift-fields">
              <div className="form-field">
                <label htmlFor={`timeslot-start-${timeslot.clientId}`}>Reporting date and time <span aria-hidden="true">*</span></label>
                <input
                  id={`timeslot-start-${timeslot.clientId}`}
                  onChange={(e) => updateTimeslot(timeslot.clientId, { startsAt: e.target.value })}
                  required type="datetime-local" value={timeslot.startsAt}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`timeslot-end-${timeslot.clientId}`}>End date and time <span className="muted">(optional)</span></label>
                <input
                  id={`timeslot-end-${timeslot.clientId}`}
                  onChange={(e) => updateTimeslot(timeslot.clientId, { endsAt: e.target.value })}
                  type="datetime-local" value={timeslot.endsAt}
                />
              </div>
              <div className="form-field">
                <label htmlFor={`timeslot-capacity-${timeslot.clientId}`}>Registration capacity</label>
                <input
                  id={`timeslot-capacity-${timeslot.clientId}`}
                  min={1} max={10000}
                  onChange={(e) => updateTimeslot(timeslot.clientId, { registrationCapacity: e.target.value ? Number(e.target.value) : null })}
                  placeholder="Unlimited" type="number" value={timeslot.registrationCapacity ?? ""}
                />
                <p className="form-help">Leave blank if there is no limit.</p>
              </div>
              <div className="form-field">
                <label htmlFor={`timeslot-label-${timeslot.clientId}`}>Shift name <span className="muted">(optional)</span></label>
                <input
                  id={`timeslot-label-${timeslot.clientId}`}
                  maxLength={120}
                  onChange={(e) => updateTimeslot(timeslot.clientId, { label: e.target.value })}
                  placeholder="Morning, afternoon…" value={timeslot.label}
                />
              </div>
            </div>
            <div className="km-shift-actions">
              <button className="button button-secondary" onClick={() => duplicateTimeslot(timeslot)} type="button">Duplicate</button>
              <button className="button button-secondary" disabled={timeslots.length === 1} onClick={() => commit(timeslots.filter(({ clientId }) => clientId !== timeslot.clientId))} type="button">Remove</button>
              <label className="km-shift-cancel">
                <input checked={timeslot.status === "cancelled"} onChange={(e) => updateTimeslot(timeslot.clientId, { status: e.target.checked ? "cancelled" : "scheduled" })} type="checkbox" />
                Cancelled
              </label>
            </div>
          </div>
        ))}
      </div>
      <button className="button button-secondary" onClick={() => commit([...timeslots, blankTimeslot(`new-${nextClientId.current++}`)])} type="button">+ Add shift</button>
    </fieldset>
  );
}
