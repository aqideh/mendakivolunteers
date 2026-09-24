import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { createQuickEvent } from "./actions";

export const metadata: Metadata = { title: "Quick Event Operations" };

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function QuickEventPage({ searchParams }: PageProps) {
  await requireEventManager("/admin/events/quick");
  const params = await searchParams;
  const error = parameter(params, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Quick Event Operations" dashboard />
      <main className="page-frame narrow-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Manual / last-minute event</p>
            <h1>Open Event Operations without publishing an opportunity.</h1>
            <p className="muted">
              Create a staff-only event, upload a CSV roster and begin attendance
              operations. Choose the data boundary before importing volunteers.
            </p>
          </div>
          <Link className="button button-secondary" href="/admin/events">
            Back to events
          </Link>
        </div>

        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <form action={createQuickEvent} className="panel phaseone-admin-form">
          <div className="form-field">
            <label htmlFor="title">Event name</label>
            <input id="title" maxLength={160} minLength={3} name="title" required />
          </div>

          <div className="form-field">
            <label htmlFor="venue">Venue</label>
            <input id="venue" maxLength={240} name="venue" />
          </div>

          <div className="form-field">
            <label htmlFor="shiftLabel">Shift name</label>
            <input
              id="shiftLabel"
              maxLength={120}
              name="shiftLabel"
              placeholder="e.g. Main shift"
            />
          </div>

          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="startsAt">Start</label>
              <input id="startsAt" name="startsAt" required type="datetime-local" />
            </div>
            <div className="form-field">
              <label htmlFor="endsAt">End</label>
              <input id="endsAt" name="endsAt" required type="datetime-local" />
            </div>
          </div>

          <fieldset className="form-field">
            <legend>How should this event affect the main volunteer database?</legend>
            <label>
              <input defaultChecked name="dataScope" type="radio" value="isolated" />{" "}
              <strong>Keep isolated</strong> — roster and attendance stay inside this
              event only. No KELUARGA volunteer records are created and no contribution
              hours are credited.
            </label>
            <label>
              <input name="dataScope" type="radio" value="integrated" />{" "}
              <strong>Include in KELUARGA</strong> — match existing volunteers or create
              new KELUARGA volunteer records from reliable identifiers in the CSV.
            </label>
          </fieldset>

          <label className="form-field">
            <span>
              <input name="creditHours" type="checkbox" /> Credit completed attendance
              as KELUARGA contribution hours
            </span>
            <span className="muted">
              Available only for the integrated option. These app-owned contribution
              hours remain separate from authoritative YM Hub verified hours.
            </span>
          </label>

          <div className="notice">
            <strong>Integrated CSV requirement:</strong> each volunteer must have an
            existing KELUARGA ID, an email address or a mobile number. Name-only rows
            cannot be safely matched or registered in the main database.
          </div>

          <button className="button button-primary" type="submit">
            Create event & upload roster
          </button>
        </form>
      </main>
    </div>
  );
}
