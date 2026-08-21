"use client";

import { useMemo, useState } from "react";

import { importRoster } from "@/app/admin/events/actions";

type RosterTimeslot = Readonly<{
  id: string;
  label: string | null;
  starts_at: string;
  ends_at: string | null;
  status: string;
}>;

type RosterRow = Readonly<{
  timeslot_id: string;
  volunteer_key: string | null;
  volunteer_name: string;
  email: string | null;
  mobile: string | null;
  tshirt_size: string | null;
}>;

function parseDelimitedLine(line: string, delimiter: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line.charAt(index);
    if (character === '"') {
      if (quoted && line.charAt(index + 1) === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === delimiter && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function singaporeDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function timeslotLabel(timeslot: RosterTimeslot): string {
  if (timeslot.label?.trim()) return timeslot.label.trim();
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  return end ? `${start}-${end}` : start;
}

function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function matchKey(row: RosterRow): string {
  if (row.volunteer_key) return `id:${row.volunteer_key.toLowerCase()}`;
  if (row.email) return `email:${row.email.toLowerCase()}`;
  if (row.mobile) return `mobile:${row.mobile.replace(/\D/g, "")}`;
  return `name:${normalize(row.volunteer_name)}`;
}

function parseRosterText(text: string, timeslots: readonly RosterTimeslot[]): RosterRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("Roster must include a header row and at least one volunteer.");
  if (timeslots.length === 0) throw new Error("Add an event timeslot before importing a roster.");

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0]!, delimiter).map((header) => header.toLowerCase().replace(/[\s-]+/g, "_"));
  const aliases: Record<string, string[]> = {
    volunteer_key: ["volunteer_key", "volunteer_id", "id"],
    volunteer_name: ["volunteer_name", "name", "full_name"],
    email: ["email", "email_address"],
    mobile: ["mobile", "phone", "mobile_number", "contact_number"],
    tshirt_size: ["tshirt_size", "t_shirt_size", "shirt_size", "size"],
    date: ["date", "shift_date", "event_date"],
    shift: ["shift", "shift_name", "timeslot"],
    timeslot_id: ["timeslot_id", "shift_id"],
  };

  const column = (name: keyof typeof aliases): number =>
    headers.findIndex((header) => aliases[name]!.includes(header));

  const keyIndex = column("volunteer_key");
  const nameIndex = column("volunteer_name");
  const emailIndex = column("email");
  const mobileIndex = column("mobile");
  const tshirtIndex = column("tshirt_size");
  const dateIndex = column("date");
  const shiftIndex = column("shift");
  const timeslotIdIndex = column("timeslot_id");
  if (nameIndex < 0) {
    throw new Error("Roster requires a volunteer_name column. Volunteer ID is optional.");
  }

  const activeTimeslots = timeslots.filter((timeslot) => timeslot.status !== "cancelled");
  const byId = new Map(activeTimeslots.map((timeslot) => [timeslot.id, timeslot]));
  const byDateAndLabel = new Map<string, RosterTimeslot[]>();
  for (const timeslot of activeTimeslots) {
    const key = `${singaporeDate(timeslot.starts_at)}|${normalize(timeslotLabel(timeslot))}`;
    const matches = byDateAndLabel.get(key) ?? [];
    matches.push(timeslot);
    byDateAndLabel.set(key, matches);
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseDelimitedLine(line, delimiter);
    const volunteerKey = keyIndex >= 0 ? values[keyIndex]?.trim() || null : null;
    const volunteerName = values[nameIndex]?.trim() ?? "";
    if (!volunteerName) {
      throw new Error(`Row ${index + 2} is missing a volunteer name.`);
    }

    let timeslot: RosterTimeslot | undefined;
    const suppliedTimeslotId = timeslotIdIndex >= 0 ? values[timeslotIdIndex]?.trim() : "";
    if (suppliedTimeslotId) {
      timeslot = byId.get(suppliedTimeslotId);
      if (!timeslot) throw new Error(`Row ${index + 2} has an invalid shift ID.`);
    } else if (activeTimeslots.length === 1) {
      timeslot = activeTimeslots[0];
    } else {
      const date = dateIndex >= 0 ? values[dateIndex]?.trim() ?? "" : "";
      const shift = shiftIndex >= 0 ? values[shiftIndex]?.trim() ?? "" : "";
      if (!date || !shift) {
        throw new Error(`Row ${index + 2} requires date and shift for this multi-shift event.`);
      }
      const matches = byDateAndLabel.get(`${date}|${normalize(shift)}`) ?? [];
      if (matches.length === 0) {
        throw new Error(`Row ${index + 2} does not match an event date and shift.`);
      }
      if (matches.length > 1) {
        throw new Error(`Row ${index + 2} matches more than one shift. Use the timeslot_id column.`);
      }
      timeslot = matches[0];
    }

    if (!timeslot) throw new Error(`Row ${index + 2} could not be assigned to a shift.`);

    return {
      timeslot_id: timeslot.id,
      volunteer_key: volunteerKey,
      volunteer_name: volunteerName,
      email: emailIndex >= 0 ? values[emailIndex]?.trim() || null : null,
      mobile: mobileIndex >= 0 ? values[mobileIndex]?.trim() || null : null,
      tshirt_size: tshirtIndex >= 0 ? values[tshirtIndex]?.trim() || null : null,
    };
  });

  if (rows.length > 2000) throw new Error("Roster imports are limited to 2,000 rows.");
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.timeslot_id}|${matchKey(row)}`;
    if (seen.has(key)) {
      throw new Error(`Duplicate volunteer in the same shift: ${row.volunteer_name}`);
    }
    seen.add(key);
  }
  return rows;
}

export function RosterUpload({
  eventId,
  timeslots,
}: {
  eventId: string;
  timeslots: readonly RosterTimeslot[];
}) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pastedRoster, setPastedRoster] = useState("");
  const [error, setError] = useState("");
  const preview = useMemo(() => rows.slice(0, 8), [rows]);
  const timeslotById = useMemo(
    () => new Map(timeslots.map((timeslot) => [timeslot.id, timeslot])),
    [timeslots],
  );

  function loadRoster(text: string, sourceName: string) {
    setRows([]);
    setError("");
    setFileName(sourceName);
    try {
      setRows(parseRosterText(text, timeslots));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Roster could not be read.");
    }
  }

  return (
    <form action={importRoster} className="phaseone-admin-form">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="fileName" type="hidden" value={fileName || "pasted-roster"} />
      <input name="rows" type="hidden" value={JSON.stringify(rows)} />

      <div className="phaseone-roster-upload-header">
        <div>
          <p className="muted">Paste rows from Excel/Google Sheets or upload a CSV. Use the event template so dates and shift names match the schedule.</p>
        </div>
        <a className="button button-secondary" href={`/admin/events/${eventId}/roster-template`}>
          Download roster template
        </a>
      </div>

      <div className="form-field">
        <label htmlFor="pastedRoster">Paste roster</label>
        <textarea
          id="pastedRoster"
          onChange={(event) => setPastedRoster(event.target.value)}
          placeholder={"volunteer_name\tcontact_number\ttshirt_size\nNur Aisyah\t91234567\tM"}
          rows={8}
          value={pastedRoster}
        />
        <p className="muted">Include the header row when pasting. Excel and Google Sheets tab-separated paste is supported.</p>
        <button
          className="button button-secondary"
          disabled={!pastedRoster.trim()}
          onClick={() => loadRoster(pastedRoster, "pasted-roster")}
          type="button"
        >
          Preview pasted roster
        </button>
      </div>

      <div className="form-field">
        <label htmlFor="rosterFile">Or upload CSV roster</label>
        <input
          accept=".csv,text/csv"
          id="rosterFile"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            if (!file) return;
            loadRoster(await file.text(), file.name);
          }}
          type="file"
        />
        <p className="muted">
          Required: volunteer_name. Optional: volunteer_id, contact_number, email, tshirt_size. Multi-shift events also use date and shift.
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="mode">Import mode</label>
        <select defaultValue="merge" id="mode" name="mode">
          <option value="merge">Merge and update matching volunteers within each shift</option>
          <option value="replace">Replace entire roster</option>
        </select>
        <p className="muted">Matching uses Volunteer ID when available, then email, contact number, and finally name. Replace is blocked once attendance records exist.</p>
      </div>

      {error ? <p className="phaseone-form-error" role="alert">{error}</p> : null}
      {rows.length ? (
        <div className="phaseone-roster-preview">
          <p><strong>{rows.length}</strong> volunteer assignments ready to import.</p>
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>Date</th><th>Shift</th><th>Name</th><th>Volunteer ID</th><th>Contact</th><th>T-shirt</th></tr></thead>
              <tbody>
                {preview.map((row, index) => {
                  const timeslot = timeslotById.get(row.timeslot_id);
                  return (
                    <tr key={`${row.timeslot_id}-${matchKey(row)}-${index}`}>
                      <td>{timeslot ? singaporeDate(timeslot.starts_at) : "—"}</td>
                      <td>{timeslot ? timeslotLabel(timeslot) : "—"}</td>
                      <td>{row.volunteer_name}</td>
                      <td>{row.volunteer_key ?? "—"}</td>
                      <td>{row.mobile ?? "—"}</td>
                      <td>{row.tshirt_size ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {rows.length > preview.length ? <p className="muted">Showing the first {preview.length} rows.</p> : null}
        </div>
      ) : null}

      <button className="button button-primary" disabled={!rows.length || Boolean(error)} type="submit">
        Import roster
      </button>
    </form>
  );
}
