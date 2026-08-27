"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  importRosterWithDiagnostics,
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

const initialRosterImportState: RosterImportState = {
  status: "idle",
  message: "",
};

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
    if (volunteerName.length > 200) diagnostics.push({ row: rowNumber, code: "NAME_TOO_LONG", message: "volunteer_name must be 200 characters or fewer." });
    if (volunteerKey && volunteerKey.length > 120) diagnostics.push({ row: rowNumber, code: "ID_TOO_LONG", message: "volunteer_id must be 120 characters or fewer." });
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) diagnostics.push({ row: rowNumber, code: "INVALID_EMAIL", message: `Email does not look valid: ${email}` });
    if (mobile && mobile.length > 40) diagnostics.push({ row: rowNumber, code: "CONTACT_TOO_LONG", message: "contact_number must be 40 characters or fewer." });
    if (tshirtSize && tshirtSize.length > 20) diagnostics.push({ row: rowNumber, code: "SIZE_TOO_LONG", message: "tshirt_size must be 20 characters or fewer." });

    let timeslot: RosterTimeslot | undefined;
    const suppliedTimeslotId = timeslotIdIndex >= 0 ? values[timeslotIdIndex]?.trim() : "";
    if (suppliedTimeslotId) {
      timeslot = byId.get(suppliedTimeslotId);
      if (!timeslot) diagnostics.push({ row: rowNumber, code: "INVALID_TIMESLOT_ID", message: "timeslot_id is not an active shift for this event. Download a fresh template." });
    } else if (activeTimeslots.length === 1) {
      timeslot = activeTimeslots[0];
    } else {
      const date = dateIndex >= 0 ? values[dateIndex]?.trim() ?? "" : "";
      const shift = shiftIndex >= 0 ? values[shiftIndex]?.trim() ?? "" : "";
      if (!date || !shift) {
        diagnostics.push({ row: rowNumber, code: "MISSING_SHIFT", message: "This event has multiple shifts. Provide date and shift, or use the downloaded template." });
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
        diagnostics.push({ row: rowNumber, code: "INVALID_DATE", message: "date must use YYYY-MM-DD, for example 2026-08-29." });
      } else {
        const matches = byDateAndLabel.get(`${date}|${normalize(shift)}`) ?? [];
        if (matches.length === 0) diagnostics.push({ row: rowNumber, code: "SHIFT_NOT_FOUND", message: `No event shift matches ${date} and “${shift}”. Use the exact shift name shown in formatting help.` });
        else if (matches.length > 1) diagnostics.push({ row: rowNumber, code: "AMBIGUOUS_SHIFT", message: "More than one event shift has this date and name. Use the downloaded template." });
        else timeslot = matches[0];
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
      if (previous) diagnostics.push({ row: null, code: "DUPLICATE_IDENTITY", message: `${row.volunteer_name} duplicates ${previous} within the same shift.` });
      else seen.set(key, row.volunteer_name);
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
  const activeTimeslots = useMemo(() => timeslots.filter((timeslot) => timeslot.status !== "cancelled"), [timeslots]);
  const timeslotById = useMemo(() => new Map(timeslots.map((timeslot) => [timeslot.id, timeslot])), [timeslots]);

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
      className="phaseone-admin-form phaseone-roster-form"
      onSubmit={(event) => {
        event.preventDefault();
        submitRoster(event.currentTarget);
      }}
    >
      <input name="eventId" type="hidden" value={eventId} />
      <input name="fileName" type="hidden" value={fileName || "pasted-roster"} />
      <input name="rows" type="hidden" value={JSON.stringify(rows)} />

      <div className="phaseone-roster-toolbar">
        <p className="muted">Paste from Excel/Google Sheets or upload a CSV. Volunteer name is the only required person field.</p>
        <a className="button button-secondary" href={`/admin/events/${eventId}/roster-template`}>Download template</a>
      </div>

      <div className="form-field">
        <label htmlFor="pastedRoster">Paste roster</label>
        <textarea
          id="pastedRoster"
          onChange={(event) => setPastedRoster(event.target.value)}
          placeholder={activeTimeslots.length > 1
            ? "volunteer_name\tcontact_number\temail\tdate\tshift\nNur Aisyah\t91234567\taisyah@example.com\t2026-08-29\tMorning"
            : "volunteer_name\tcontact_number\temail\nNur Aisyah\t91234567\taisyah@example.com"}
          rows={6}
          value={pastedRoster}
        />
        <button
          className="button button-secondary"
          disabled={!pastedRoster.trim()}
          onClick={() => loadRoster(pastedRoster, "pasted-roster")}
          type="button"
        >
          Preview roster
        </button>
      </div>

      <div className="phaseone-upload-row">
        <div className="form-field">
          <label htmlFor="rosterFile">Or upload CSV</label>
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
        </div>
      </div>

      <details className="phaseone-disclosure">
        <summary>Formatting help</summary>
        <div className="phaseone-disclosure-body">
          <p><strong>Accepted columns</strong></p>
          <ul className="phaseone-compact-list">
            <li><code>volunteer_name</code> — required</li>
            <li><code>contact_number</code>, <code>email</code>, <code>volunteer_id</code>, <code>tshirt_size</code> — optional</li>
            {activeTimeslots.length > 1 ? <li><code>date</code> and <code>shift</code> — required for multi-shift events unless using the downloaded template</li> : null}
          </ul>
          {activeTimeslots.length > 1 ? (
            <div className="phaseone-shift-help">
              <p><strong>Valid shifts</strong></p>
              <ul className="phaseone-compact-list">
                {activeTimeslots.map((timeslot) => (
                  <li key={timeslot.id}>{singaporeDate(timeslot.starts_at)} — {timeslotLabel(timeslot)}</li>
                ))}
              </ul>
              <details className="phaseone-inline-disclosure">
                <summary>Technical template identifiers</summary>
                <div className="table-wrap">
                  <table className="content-table">
                    <thead><tr><th>Date</th><th>Shift</th><th>timeslot_id</th></tr></thead>
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
              </details>
            </div>
          ) : null}
        </div>
      </details>

      <details className="phaseone-disclosure">
        <summary>Advanced import options</summary>
        <div className="phaseone-disclosure-body">
          <div className="form-field">
            <label htmlFor="mode">Import mode</label>
            <select defaultValue="merge" id="mode" name="mode">
              <option value="merge">Merge with current roster</option>
              <option value="replace">Replace entire roster</option>
            </select>
            <p className="muted">Merge is recommended. Replace is blocked once attendance exists.</p>
          </div>
        </div>
      </details>

      {ignoredHelperRows > 0 ? <p className="muted">Ignored {ignoredHelperRows} blank template row{ignoredHelperRows === 1 ? "" : "s"}.</p> : null}

      {diagnostics.length > 0 ? (
        <div className="phaseone-form-error" role="alert">
          <p><strong>{diagnostics.length} issue{diagnostics.length === 1 ? "" : "s"} need attention</strong></p>
          <ul>
            {diagnostics.slice(0, 20).map((diagnostic, index) => (
              <li key={`${diagnostic.code}-${diagnostic.row ?? "general"}-${index}`}>
                {diagnostic.row ? `Row ${diagnostic.row}: ` : ""}{diagnostic.message}
              </li>
            ))}
          </ul>
          <details className="phaseone-inline-disclosure">
            <summary>Technical diagnostic codes</summary>
            <ul className="phaseone-compact-list">
              {diagnostics.slice(0, 20).map((diagnostic, index) => (
                <li key={`code-${diagnostic.code}-${diagnostic.row ?? "general"}-${index}`}><code>{diagnostic.code}</code></li>
              ))}
            </ul>
          </details>
        </div>
      ) : null}

      {rows.length ? (
        <div className="phaseone-roster-preview">
          <div className="phaseone-preview-summary">
            <strong>{rows.length} volunteer assignment{rows.length === 1 ? "" : "s"} ready</strong>
            <span className="muted">Showing {Math.min(preview.length, rows.length)}</span>
          </div>
          <div className="table-wrap">
            <table className="content-table phaseone-roster-summary-table">
              <thead><tr><th>Name</th>{activeTimeslots.length > 1 ? <th>Shift</th> : null}<th>Contact</th></tr></thead>
              <tbody>
                {preview.map((row, index) => {
                  const timeslot = timeslotById.get(row.timeslot_id);
                  const contact = row.mobile ?? row.email ?? row.volunteer_key ?? "—";
                  return (
                    <tr key={`${row.timeslot_id}-${matchKey(row)}-${index}`}>
                      <td>{row.volunteer_name}</td>
                      {activeTimeslots.length > 1 ? <td>{timeslot ? `${singaporeDate(timeslot.starts_at)} · ${timeslotLabel(timeslot)}` : "—"}</td> : null}
                      <td>{contact}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ) : null}

      {importState.status !== "idle" ? (
        <div className={importState.status === "error" ? "phaseone-form-error" : "phaseone-form-success"} role={importState.status === "error" ? "alert" : "status"}>
          <p>{importState.message}</p>
          {importState.diagnosticCode ? (
            <details className="phaseone-inline-disclosure"><summary>Technical details</summary><code>{importState.diagnosticCode}</code></details>
          ) : null}
        </div>
      ) : null}

      <button className="button button-primary" disabled={!rows.length || diagnostics.length > 0 || isImporting} type="submit">
        {isImporting ? "Importing…" : rows.length ? `Import ${rows.length} volunteer${rows.length === 1 ? "" : "s"}` : "Import roster"}
      </button>
    </form>
  );
}
