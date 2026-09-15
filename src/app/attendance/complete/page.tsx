import type { Metadata } from "next";

import { PortalHeader } from "@/components/portal-header";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Attendance recorded" };
export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };
function param(value: string | string[] | undefined) { return Array.isArray(value) ? value[0] : value; }

export default async function AttendanceCompletePage({ searchParams }: Props) {
  const query = await searchParams;
  const eventId = param(query.event) ?? "";
  const action = param(query.action);
  const status = param(query.status);
  const admin = getPhaseOneAdminClient();
  const { data: event } = eventId
    ? await admin.from("phaseone_events").select("title").eq("id", eventId).maybeSingle()
    : { data: null };

  const feedbackSaved = action === "feedback" && status === "saved";
  const checkedOut = action === "check_out" || status === "already_checked_out";
  const title = feedbackSaved ? "Thanks for your feedback" : checkedOut ? "Checked out" : "Checked in";
  const body = feedbackSaved
    ? "Your feedback has been recorded."
    : checkedOut
      ? "Your checkout has been recorded. You can close this page."
      : status === "already_checked_in"
        ? "You were already checked in. No additional check-in was created."
        : "Your check-in has been recorded. You can close this page.";

  return (
    <div className="site-shell">
      <PortalHeader status="Attendance" lite />
      <main className="attendance-self-page page-frame">
        <section className="attendance-self-card attendance-complete-card">
          <div className="attendance-complete-mark" aria-hidden="true">✓</div>
          <p className="eyebrow">KELUARGA attendance</p>
          <h1>{title}</h1>
          {event?.title ? <h2>{event.title}</h2> : null}
          <p>{body}</p>
        </section>
      </main>
    </div>
  );
}
