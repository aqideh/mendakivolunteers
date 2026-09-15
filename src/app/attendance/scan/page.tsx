import type { Metadata } from "next";

import { PortalHeader } from "@/components/portal-header";
import {
  confirmQrAttendance,
  identifyAttendanceVolunteer,
  resolveAttendancePersonForToken,
} from "@/app/attendance/actions";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Check attendance" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

function errorText(code: string | undefined) {
  if (code === "expired") return "This QR code has expired. Please scan the current QR shown by staff.";
  if (code === "not_found") return "We could not find one unique roster entry with those details. Please approach a MENDAKI staff member.";
  if (code === "identify_first") return "Please identify yourself before confirming attendance.";
  if (code === "attendance_failed") return "Attendance could not be recorded. Please approach a MENDAKI staff member.";
  if (code === "invalid_details") return "Enter the email address or contact number used for this event.";
  return null;
}

export default async function AttendanceScanPage({ searchParams }: Props) {
  const query = await searchParams;
  const token = param(query.t) ?? "";
  const error = errorText(param(query.error));
  const resolved = token ? await resolveAttendancePersonForToken(token) : null;

  if (!resolved?.context) {
    return (
      <div className="site-shell">
        <PortalHeader status="Attendance" lite />
        <main className="attendance-self-page page-frame">
          <section className="attendance-self-card">
            <p className="eyebrow">KELUARGA attendance</p>
            <h1>QR unavailable</h1>
            <p>This QR code is invalid or has expired. Please scan the current QR shown by MENDAKI staff.</p>
          </section>
        </main>
      </div>
    );
  }

  const admin = getPhaseOneAdminClient();
  const [{ data: event }, { data: slot }] = await Promise.all([
    admin.from("phaseone_events").select("title, venue").eq("id", resolved.context.qr.event_id).maybeSingle(),
    admin.from("phaseone_event_timeslots").select("label, starts_at, ends_at").eq("id", resolved.context.qr.timeslot_id).maybeSingle(),
  ]);
  const actionLabel = resolved.context.qr.action === "check_in" ? "Check in" : "Check out";

  return (
    <div className="site-shell">
      <PortalHeader status="Attendance" lite />
      <main className="attendance-self-page page-frame">
        <section className="attendance-self-card">
          <p className="eyebrow">{actionLabel}</p>
          <h1>{event?.title ?? "Volunteer event"}</h1>
          <p className="attendance-self-meta">
            {slot?.label ?? "Event shift"}{event?.venue ? ` · ${event.venue}` : ""}
          </p>

          {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

          {resolved.matched ? (
            <div className="attendance-self-confirm">
              <p className="muted">You are checking {resolved.context.qr.action === "check_in" ? "in" : "out"} as</p>
              <h2>{resolved.matched.volunteer_name}</h2>
              <form action={confirmQrAttendance}>
                <input name="token" type="hidden" value={token} />
                <button className="button button-primary attendance-self-primary" type="submit">
                  Confirm {actionLabel.toLowerCase()}
                </button>
              </form>
              <p className="muted attendance-self-help">Wrong person? Use another browser/device or ask staff to record attendance manually.</p>
            </div>
          ) : (
            <form action={identifyAttendanceVolunteer} className="attendance-self-identify">
              <input name="token" type="hidden" value={token} />
              <div className="form-field">
                <label htmlFor="attendance-identifier">Find your roster entry</label>
                <input
                  autoComplete="email"
                  id="attendance-identifier"
                  name="identifier"
                  placeholder="Email or contact number"
                  required
                />
                <p className="muted">Use the email address or contact number provided when you registered.</p>
              </div>
              <button className="button button-primary attendance-self-primary" type="submit">Continue</button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
}
