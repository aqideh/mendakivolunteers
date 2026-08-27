"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  importRosterWithDiagnostics,
  initialRosterImportState,
  type RosterImportState,
} from "@/app/admin/events/roster-actions";

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

type RosterDiagnostic = Readonly<{
  row: number | null;
  code: string;
  message: string;
}>;

type ParseResult = Readonly<{
  rows: RosterRow[];
  diagnostics: RosterDiagnostic[];
  ignoredHelperRows: number;
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

function canonicalMobile(value: string | null): string | null {
  if (!value) return null;
  const digits = value.replace(/\D/g, "");
  if (/^0065\d{8}$/.test(digits)) return digits.slice(4);
  if (/^65\d{8}$/.test(digits)) return digits.slice(2);
  return digits || null;
}

function matchKey(row: RosterRow): string {
  if (row.volunteer_key) return `id:${row.volunteer_key.toLowerCase()}`;
  if (row.email) return `email:${row.email.toLowerCase()}`;
  const mobile = canonicalMobile(row.mobile);
  if (mobile) return `mobile:${mobile}`;
  return `name:${normalize(row.volunteer_name)}`;
}

function rowIdentityKeys(row: RosterRow): string[] {
  const keys: string[] = [];
  if (row.volunteer_key) keys.push(`id:${row.volunteer_key.toLowerCase()}`);
  if (row.email) keys.push(`email:${row.email.toLowerCase()}`);
  const mobile = canonicalMobile(row.mobile);
  if (mobile) keys.push(`mobile:${mobile}`);
  if (keys.length === 0) keys.push(`name:${normalize(row.volunteer_name)}`);
  return keys;
}

function parseRosterText(text: string, timeslots: readonly RosterTimeslot[]): ParseResult {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) {
    return {
      rows: [],
      diagnostics: [{ row: null, code: "MISSING_ROWS", message: "Include a header row and at least one volunteer row." }],
      ignoredHelperRows: 0,
    };
  }
  if (timeslots.length === 0) {
    return {
      rows: [],
      diagnostics: [{ row: null, code: "NO_EVENT_SHIFT", message: "Add an event timeslot before importing a roster." }],
      ignoredHelperRows: 0,
    };
  }

  const delimiter = lines[0]!.includes("\t") ? "\t" : ",";
  const headers = parseDelimitedLine(lines[0]!, delimiter).map((header) =>
    header.toLowerCase().replace(/[\s-]+/g, "_"),
  );
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
    return {
      rows: [],
      diagnostics: [{ row: 1, code: "MISSING_NAME_HEADER", message: "Required column volunteer_name is missing. Accepted aliases are name and full_name." }],
      ignoredHelperRows: 0,
    };
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

  const rows: RosterRow[] = [];
  const diagnostics: RosterDiagnostic[] = [];
  let ignoredHelperRows = 0;

  lines.slice(1).forEach((line, index) => {
    const rowNumber = index + 2;
    const values = parseDelimitedLine(line, delimiter);
    const volunteerKey = keyIndex >= 0 ? values[keyIndex]?.trim() || null : null;
    const volunteerName = values[nameIndex]?.trim() ?? "";
    const email = emailIndex >= 0 ? values[emailIndex]?.trim() || null : null;
    const mobile = mobileIndex >= 0 ? values[mobileIndex]?.trim() || null : null;
    const tshirtSize = tshirtIndex >= 0 ? values[tshirtIndex]?.trim() || null : null;

    const hasVolunteerData = Boolean(volunteerKey || volunteerName || email || mobile || tshirtSize);
    if (!hasVolunteerData) {
      ignoredHelperRows += 1;
      return;
    }
    if (!volunteerName) {
      diagnostics.push({ row: rowNumber, code: "MISSING_NAME", message: "volunteer_name is required for every volunteer row." });
      return;
    }
    if (volunteerName.length > 200) {
      diagnostics.push({ row: rowNumber, code: "NAME_TOO_LONG", message: "volunteer_name must be 200 characters or fewer." });
    }
    if (volunteerKey && volunteerKey.length > 120) {
      diagnostics.push({ row: rowNumber, code: "ID_TOO_LONG", message: "volunteer_id must be 120 characters or fewer." });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      diagnostics.push({ row: rowNumber, code: "INVALID_EMAIL", message: `Email does not look valid: ${email}` });
    }
    if (mobile && mobile.length > 40) {
      diagnostics.push({ row: rowNumber, code: "CONTACT_TOO_LONG", message: "contact_number must be 40 characters or fewer." });
    }
    if (tshirtSize && tshirtSize.length > 20) {
      diagnostics.push({ row: rowNumber, code: "SIZE_TOO_LONG", message: "tshirt_size must be 20 characters or fewer." });
    }

    let timeslot: RosterTimeslot | undefined;
    const suppliedTimeslotId = timeslotIdIndex >= 0 ? values[timeslotIdIndex]?.trim() : "";
    if (suppliedTimeslotId) {
      timeslot = byId.get(suppliedTimeslotId);
      if (!timeslot) {
        diagnostics.push({ row: rowNumber, code: "INVALID_TIMESLOT_ID", message: "timeslot_id is not an active shift for this event. Download a fresh template." });
      }
    } else if (activeTimeslots.length === 1) {
      timeslot = activeTimeslots[0];
    } else {
      const date = dateIndex >= 0 ? values[dateIndex]?.trim() ?? "" : "";
      const shift = shiftIndex >= 0 ? values[shiftIndex]?.trim() ?? "" : "";
      if (!date || !shift) {
        diagnostics.push({ row: rowNumber, code: "MISSING_SHIFT", message: "This event has multiple shifts. Provide timeslot_id, or both date (YYYY-MM-DD) and shift." });
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        diagnostics.push({ row: rowNumber, code: "INVALID_DATE", message: "date must use YYYY-MM-DD, for example 2026-08-29." });
      } else {
        const matches = byDateAndLabel.get(`${date}|${normalize(shift)}`) ?? [];
        if (matches.length === 0) {
          diagnostics.push({ row: rowNumber, code: "SHIFT_NOT_FOUND", message: `No event shift matches date ${date} and shift “${shift}”. Use the exact values shown below or use timeslot_id.` });
        } else if (matches.length > 1) {
          diagnostics.push({ row: rowNumber, code: "AMBIGUOUS_SHIFT", message: "More than one event shift matches this date and shift. Use timeslot_id." });
        } else {
          timeslot = matches[0];
        }
      }
    }

    const rowHasDiagnostic = diagnostics.some((diagnostic) => diagnostic.row === rowNumber);
    if (timeslot && !rowHasDiagnostic) {
      rows.push({
        timeslot_id: timeslot.id,
        volunteer_key: volunteerKey,
        volunteer_name: volunteerName,
        email,
        mobile,
        tshirt_size: tshirtSize,
      });
    }
  });

  if (rows.length + diagnostics.length > 2000) {
    diagnostics.push({ row: null, code: "TOO_MANY_ROWS", message: "Roster imports are limited to 2,000 volunteer rows." });
  }

  const seen = new Map<string, string>();
  for (const row of rows) {
    for (const identity of rowIdentityKeys(row)) {
      const key = `${row.timeslot_id}|${identity}`;
      const previous = seen.get(key);
      if (previous) {
        diagnostics.push({ row: null, code: "DUPLICATE_IDENTITY", message: `${row.volunteer_name} duplicates ${previous} within the same shift (${identity.split(":")[0]} match).` });
      } else {
        seen.set(key, row.volunteer_name);
      }
    }
  }

  return { rows, diagnostics, ignoredHelperRows };
}

export function RosterUpload({
  eventId,
  timeslots,
}: {
  eventId: string;
  timeslots: readonly RosterTimeslot[];
}) {
  const router = useRouter();
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [pastedRoster, setPastedRoster] = useState("");
  const [diagnostics, setDiagnostics] = useState<RosterDiagnostic[]>([]);
  const [ignoredHelperRows, setIgnoredHelperRows] = useState(0);
  const [importState, setImportState] = useState<RosterImportState>(initialRosterImportState);
  const [isImporting, startImportTransition] = useTransition();
  const preview = useMemo(() => rows.slice(0, 8), [rows]);
  const activeTimeslots = useMemo(
    () => timeslots.filter((timeslot) => timeslot.status !== "cancelled"),
    [timeslots],
  );
  const timeslotById = useMemo(
    () => new Map(timeslots.map((timeslot) => [timeslot.id, timeslot])),
    [timeslots],
  );

  function loadRoster(text: string, sourceName: string) {
    setRows([]);
    setDiagnostics([]);
    setIgnoredHelperRows(0);
    setImportState(initialRosterImportState);
    setFileName(sourceName);
    const result = parseRosterText(text, timeslots);
    setRows(result.rows);
    setDiagnostics(result.diagnostics);
    setIgnoredHelperRows(result.ignoredHelperRows);
  }

  function submitRoster(form: HTMLFormElement) {
    const formData = new FormData(form);
    setImportState(initialRosterImportState);
    startImportTransition(async () => {
      const result = await importRosterWithDiagnostics(formData);
      setImportState(result);
      if (result.status === "success") router.refresh();
    });
  }

  return (
    <form
      className="phaseone-admin-form"
      onSubmit={(event) => {
        event.preventDefault();
        submitRoster(event.currentTarget);
      }}
    >
      <input name="eventId" type="hidden" value={eventId} />
      <input name="fileName" type="hidden" value={fileName || "pasted-roster"} />
      <input name="rows" type="hidden" value={JSON.stringify(rows)} />

      <div className="phaseone-roster-upload-header">
        <div>
          <p><strong>Expected roster format</strong></p>
          <p className="muted">
            One volunteer per row. Include the header row. The only required volunteer field is <code>volunteer_name</code>.
          </p>
        </div>
        <a className="button button-secondary" href={`/admin/events/${eventId}/roster-template`}>
          Download roster template
        </a>
      </div>

      <div className="table-wrap">
        <table className="content-table">
          <thead><tr><th>Column</th><th>Required?</th><th>Expected value</th></tr></thead>
          <tbody>
            <tr><td><code>volunteer_name</code></td><td>Yes</td><td>Volunteer’s full name.</td></tr>
            <tr><td><code>volunteer_id</code></td><td>No</td><td>MENDAKI/roster volunteer ID, up to 120 characters.</td></tr>
            <tr><td><code>contact_number</code></td><td>No</td><td>Phone number. 91234567, +65 9123 4567 and 0065 9123 4567 are accepted.</td></tr>
            <tr><td><code>email</code></td><td>No</td><td>A valid email address.</td></tr>
            <tr><td><code>tshirt_size</code></td><td>No</td><td>Free text, up to 20 characters, e.g. S, M, L, XL.</td></tr>
            <tr><td><code>date</code> + <code>shift</code></td><td>{activeTimeslots.length > 1 ? "For multi-shift events" : "No"}</td><td>Date must be YYYY-MM-DD; shift must exactly match the event shift below.</td></tr>
            <tr><td><code>timeslot_id</code></td><td>No</td><td>Preferred for multi-shift imports; overrides date + shift matching.</td></tr>
          </tbody>
        </table>
      </div>

      {activeTimeslots.length > 0 ? (
        <div className="phaseone-roster-preview">
          <p><strong>Valid shift values for this event</strong></p>
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>Date</th><th>shift</th><th>timeslot_id</th></tr></thead>
              <tbody>
                {activeTimeslots.map((timeslot) => (
                  <tr key={timeslot.id}>
                    <td>{singaporeDate(timeslot.starts_at)}</td>
                    <td>{timeslotLabel(timeslot)}</td>
                    <td><code>{timeslot.id}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      <div className="form-field">
        <label htmlFor="pastedRoster">Paste roster</label>
        <textarea
          id="pastedRoster"
          onChange={(event) => setPastedRoster(event.target.value)}
          placeholder={activeTimeslots.length > 1
            ? "volunteer_name\tcontact_number\temail\tvolunteer_id\tdate\tshift\nNur Aisyah\t91234567\taisyah@example.com\tMV-001\t2026-08-29\tMorning"
            : "volunteer_name\tcontact_number\temail\tvolunteer_id\ttshirt_size\nNur Aisyah\t91234567\taisyah@example.com\tMV-001\tM"}
          rows={8}
          value={pastedRoster}
        />
        <p className="muted">
          Excel and Google Sheets tab-separated paste is supported. CSV-style comma-separated text is also accepted. Header aliases such as name/full_name, phone/mobile, and shirt_size are recognized.
        </p>
        <button
          className="button button-secondary"
          disabled={!pastedRoster.trim()}
          onClick={() => loadRoster(pastedRoster, "pasted-roster")}
          type="button"
        >
          Preview and diagnose pasted roster
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
          The downloaded template contains one blank helper row per event shift. Fill or duplicate those rows as needed; untouched helper rows are ignored automatically.
        </p>
      </div>

      <div className="form-field">
        <label htmlFor="mode">Import mode</label>
        <select defaultValue="merge" id="mode" name="mode">
          <option value="merge">Merge and update matching volunteers within each shift</option>
          <option value="replace">Replace entire roster</option>
        </select>
        <p className="muted">
          Matching uses Volunteer ID, then email and contact number; name is used only when no stronger identifier is supplied. Replace is blocked once attendance records exist.
        </p>
      </div>

      {ignoredHelperRows > 0 ? (
        <p className="muted">Ignored {ignoredHelperRows} blank template/helper row{ignoredHelperRows === 1 ? "" : "s"}.</p>
      ) : null}

      {diagnostics.length > 0 ? (
        <div className="phaseone-form-error" role="alert">
          <p><strong>Roster diagnostics — {diagnostics.length} issue{diagnostics.length === 1 ? "" : "s"} to fix</strong></p>
          <ul>
            {diagnostics.slice(0, 20).map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${diagnostic.row ?? "general"}-${index}`}>
                {diagnostic.row ? `Row ${diagnostic.row}: ` : ""}{diagnostic.message} <code>{diagnostic.code}</code>
              </li>
            ))}
          </ul>
          {diagnostics.length > 20 ? <p>Showing the first 20 issues.</p> : null}
        </div>
      ) : null}

      {rows.length ? (
        <div className="phaseone-roster-preview">
          <p><strong>{rows.length}</strong> valid volunteer assignment{rows.length === 1 ? "" : "s"} ready to import.</p>
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>Date</th><th>Shift</th><th>Name</th><th>Volunteer ID</th><th>Email</th><th>Contact</th><th>T-shirt</th></tr></thead>
              <tbody>
                {preview.map((row, index) => {
                  const timeslot = timeslotById.get(row.timeslot_id);
                  return (
                    <tr key={`${row.timeslot_id}-${matchKey(row)}-${index}`}>
                      <td>{timeslot ? singaporeDate(timeslot.starts_at) : "—"}</td>
                      <td>{timeslot ? timeslotLabel(timeslot) : "—"}</td>
                      <td>{row.volunteer_name}</td>
                      <td>{row.volunteer_key ?? "—"}</td>
                      <td>{row.email ?? "—"}</td>
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

      {importState.status !== "idle" ? (
        <div
          className={importState.status === "error" ? "phaseone-form-error" : "phaseone-form-success"}
          role={importState.status === "error" ? "alert" : "status"}
        >
          <p>{importState.message}</p>
          {importState.diagnosticCode ? <p>Diagnostic code: <code>{importState.diagnosticCode}</code></p> : null}
        </div>
      ) : null}

      <button
        className="button button-primary"
        disabled={!rows.length || diagnostics.length > 0 || isImporting}
        type="submit"
      >
        {isImporting ? "Importing roster…" : "Import roster"}
      </button>
    </form>
  );
}
