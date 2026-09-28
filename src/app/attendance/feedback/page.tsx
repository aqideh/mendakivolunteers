import type { Metadata } from "next";
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
          <h1>Before you go</h1>
          <p>Your checkout has been recorded for <strong>{event.title}</strong>. Complete this short feedback to finish checking out.</p>

          {param(query.error) ? <div className="notice notice-error">Feedback could not be saved. Please check your responses and try again.</div> : null}

          <form action={submitEventFeedback} className="attendance-feedback-form">
            <input name="eventId" type="hidden" value={eventId} />
            <section>
              <h2>Training / Briefing Before Deployment</h2>
              <Rating name="briefingThorough" label="9. The staff did a thorough briefing with the volunteers" />
              <Rating name="onboardingRoleUnderstanding" label="10. The onboarding process helped me understand my volunteer role." />
            </section>

            <section>
              <h2>During the Event or Deployment</h2>
              <Rating name="roleSatisfaction" label="11. I am satisfied with the assigned role" />
              <Rating name="staffSupport" label="12. MENDAKI staff are approachable and supportive" />
            </section>

            <div className="form-field">
              <label htmlFor="feedback-suggestions">13. What can MENDAKI do to improve your volunteer experience?</label>
              <textarea id="feedback-suggestions" maxLength={1500} name="suggestions" rows={4} />
            </div>

            <button className="button button-primary attendance-self-primary" type="submit">Submit feedback &amp; complete checkout</button>
          </form>
        </section>
      </main>
    </div>
  );
}
