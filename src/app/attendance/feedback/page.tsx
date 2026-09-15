import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";

import { submitEventFeedback } from "@/app/attendance/actions";
import { PortalHeader } from "@/components/portal-header";
import { attendanceDeviceCookieName, readAttendanceDeviceToken } from "@/lib/phaseone/attendance-qr";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Volunteer feedback" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

function Rating({ name, label }: { name: string; label: string }) {
  return (
    <fieldset className="attendance-feedback-rating">
      <legend>{label}</legend>
      <div className="attendance-feedback-scale" role="radiogroup" aria-label={label}>
        {[1, 2, 3, 4, 5].map((value) => (
          <label key={value}>
            <input name={name} required type="radio" value={value} />
            <span>{value}</span>
          </label>
        ))}
      </div>
      <div className="attendance-feedback-scale-labels"><span>Low</span><span>High</span></div>
    </fieldset>
  );
}

export default async function AttendanceFeedbackPage({ searchParams }: Props) {
  const query = await searchParams;
  const eventId = param(query.event) ?? "";
  const store = await cookies();
  const identity = readAttendanceDeviceToken(store.get(attendanceDeviceCookieName)?.value);
  const validIdentity = identity && identity.eventId === eventId;
  const admin = getPhaseOneAdminClient();
  const { data: event } = eventId
    ? await admin.from("phaseone_events").select("title").eq("id", eventId).maybeSingle()
    : { data: null };

  if (!validIdentity || !event) {
    return (
      <div className="site-shell">
        <PortalHeader status="Feedback" lite />
        <main className="attendance-self-page page-frame">
          <section className="attendance-self-card">
            <h1>Feedback link unavailable</h1>
            <p>Your attendance identity has expired. Your checkout, if already recorded, is not affected.</p>
          </section>
        </main>
      </div>
    );
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Feedback" lite />
      <main className="attendance-self-page page-frame">
        <section className="attendance-self-card attendance-feedback-card">
          <p className="eyebrow">Checked out</p>
          <h1>Before you go</h1>
          <p>Your checkout has already been recorded for <strong>{event.title}</strong>. This short feedback is optional and does not affect your attendance.</p>

          {param(query.error) ? <div className="notice notice-error">Feedback could not be saved. Please check your responses and try again.</div> : null}

          <form action={submitEventFeedback} className="attendance-feedback-form">
            <input name="eventId" type="hidden" value={eventId} />
            <Rating name="roleClarity" label="I knew what I was expected to do today." />
            <Rating name="roleSatisfaction" label="I was satisfied with my volunteering role." />
            <Rating name="staffSupport" label="I received the support I needed from MENDAKI staff." />
            <Rating name="recommend" label="I would recommend this volunteering opportunity to family or friends." />

            <div className="form-field">
              <label htmlFor="feedback-suggestions">Anything we could improve? <span className="muted">optional</span></label>
              <textarea id="feedback-suggestions" maxLength={1500} name="suggestions" rows={4} placeholder="Tell us what would make the volunteering experience better." />
            </div>

            <label className="attendance-feedback-followup">
              <input name="followUpRequested" type="checkbox" />
              <span>I would like a MENDAKI staff member to follow up with me about something from today.</span>
            </label>

            <button className="button button-primary attendance-self-primary" type="submit">Submit feedback</button>
            <Link className="button button-secondary attendance-self-primary" href={`/attendance/complete?event=${encodeURIComponent(eventId)}&action=check_out&status=checked_out`}>Skip feedback</Link>
          </form>
        </section>
      </main>
    </div>
  );
}
