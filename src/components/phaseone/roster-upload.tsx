"use client";

import { useMemo, useState } from "react";

import { importRoster } from "@/app/admin/events/actions";

type RosterRow = Readonly<{
  volunteer_key: string;
  volunteer_name: string;
  email: string | null;
  mobile: string | null;
}>;

function parseCsvLine(line: string): string[] {
  const values: string[] = [];
  let value = "";
  let quoted = false;

  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (character === "," && !quoted) {
      values.push(value.trim());
      value = "";
    } else {
      value += character;
    }
  }
  values.push(value.trim());
  return values;
}

function parseRosterCsv(text: string): RosterRow[] {
  const lines = text.replace(/^\uFEFF/, "").split(/\r?\n/).filter((line) => line.trim());
  if (lines.length < 2) throw new Error("CSV must include a header and at least one volunteer.");

  const headers = parseCsvLine(lines[0]).map((header) => header.toLowerCase().replace(/[\s-]+/g, "_"));
  const aliases: Record<string, string[]> = {
    volunteer_key: ["volunteer_key", "volunteer_id", "id"],
    volunteer_name: ["volunteer_name", "name", "full_name"],
    email: ["email", "email_address"],
    mobile: ["mobile", "phone", "mobile_number", "contact_number"],
  };

  const column = (name: keyof typeof aliases): number =>
    headers.findIndex((header) => aliases[name].includes(header));

  const keyIndex = column("volunteer_key");
  const nameIndex = column("volunteer_name");
  const emailIndex = column("email");
  const mobileIndex = column("mobile");
  if (keyIndex < 0 || nameIndex < 0) {
    throw new Error("CSV requires volunteer_id and volunteer_name columns.");
  }

  const rows = lines.slice(1).map((line, index) => {
    const values = parseCsvLine(line);
    const volunteerKey = values[keyIndex]?.trim() ?? "";
    const volunteerName = values[nameIndex]?.trim() ?? "";
    if (!volunteerKey || !volunteerName) {
      throw new Error(`Row ${index + 2} is missing a volunteer ID or name.`);
    }
    return {
      volunteer_key: volunteerKey,
      volunteer_name: volunteerName,
      email: emailIndex >= 0 ? values[emailIndex]?.trim() || null : null,
      mobile: mobileIndex >= 0 ? values[mobileIndex]?.trim() || null : null,
    };
  });

  if (rows.length > 2000) throw new Error("Roster uploads are limited to 2,000 rows.");
  const seen = new Set<string>();
  for (const row of rows) {
    const normalized = row.volunteer_key.toLowerCase();
    if (seen.has(normalized)) throw new Error(`Duplicate volunteer ID: ${row.volunteer_key}`);
    seen.add(normalized);
  }
  return rows;
}

export function RosterUpload({ eventId }: { eventId: string }) {
  const [rows, setRows] = useState<RosterRow[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const preview = useMemo(() => rows.slice(0, 8), [rows]);

  return (
    <form action={importRoster} className="phaseone-admin-form">
      <input name="eventId" type="hidden" value={eventId} />
      <input name="fileName" type="hidden" value={fileName} />
      <input name="rows" type="hidden" value={JSON.stringify(rows)} />

      <div className="form-field">
        <label htmlFor="rosterFile">CSV roster</label>
        <input
          accept=".csv,text/csv"
          id="rosterFile"
          onChange={async (event) => {
            const file = event.target.files?.[0];
            setRows([]);
            setError("");
            setFileName(file?.name ?? "");
            if (!file) return;
            try {
              setRows(parseRosterCsv(await file.text()));
            } catch (cause) {
              setError(cause instanceof Error ? cause.message : "CSV could not be read.");
            }
          }}
          required
          type="file"
        />
        <p className="muted">Required columns: volunteer_id, volunteer_name. Optional: email, mobile.</p>
      </div>

      <div className="form-field">
        <label htmlFor="mode">Import mode</label>
        <select defaultValue="merge" id="mode" name="mode">
          <option value="merge">Merge and update matching volunteer IDs</option>
          <option value="replace">Replace entire roster</option>
        </select>
        <p className="muted">Replace is blocked once attendance records exist.</p>
      </div>

      {error ? <p className="phaseone-form-error" role="alert">{error}</p> : null}
      {rows.length ? (
        <div className="phaseone-roster-preview">
          <p><strong>{rows.length}</strong> volunteer rows ready to import.</p>
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>ID</th><th>Name</th><th>Email</th><th>Mobile</th></tr></thead>
              <tbody>
                {preview.map((row) => (
                  <tr key={row.volunteer_key}>
                    <td>{row.volunteer_key}</td><td>{row.volunteer_name}</td>
                    <td>{row.email ?? "—"}</td><td>{row.mobile ?? "—"}</td>
                  </tr>
                ))}
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
