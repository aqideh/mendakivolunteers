import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import {
  confirmQrAttendance,
  resolveAttendancePersonForToken,
} from "@/app/attendance/actions";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Check attendance" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

function errorText(code: string | undefined) {
  if (code === "expired") return "This QR code has expired. Please scan the current QR shown by staff.";
  if (code === "inactive") return "This Keluarga MENDAKI account is not active. Please approach a MENDAKI staff member.";
  if (code === "unlinked") return "Your account is not linked to a volunteer profile. Please approach a MENDAKI staff member.";
  if (code === "not_rostered") return "Your volunteer profile is not on this shift roster. Please approach a MENDAKI staff member.";
  if (code === "ambiguous_roster") return "Your roster identity could not be resolved safely. Please approach a MENDAKI staff member.";
  if (code === "unavailable") return "Your attendance identity could not be verified. Please approach a MENDAKI staff member.";
  if (code === "attendance_failed") return "Attendance could not be recorded. Please approach a MENDAKI staff member.";
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
            <div className="attendance-self-confirm">
              {resolved.identityState === "signed_out" ? (
                <>
                  <h2>Sign in to continue</h2>
                  <p className="muted">
                    Attendance is matched to your Keluarga MENDAKI volunteer account.
                    You will return to this QR after signing in.
                  </p>
                  <Link
                    className="button button-primary attendance-self-primary"
                    href={`/login?next=${encodeURIComponent(`/attendance/scan?t=${encodeURIComponent(token)}`)}`}
                  >
                    Sign in
                  </Link>
                </>
              ) : (
                <>
                  <h2>Staff assistance needed</h2>
                  <p className="muted">
                    {errorText(resolved.identityState) ??
                      "Your attendance identity could not be matched safely. Please ask staff to record your attendance."}
                  </p>
                </>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
