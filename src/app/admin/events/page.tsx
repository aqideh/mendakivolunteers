import type { Metadata } from "next";
import Link from "next/link";

import { duplicateEvent } from "@/app/admin/events/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
  getPackageListingStatus,
  sortTimeslots,
  type VolunteerTimeslot,
} from "@/lib/phaseone/packages";

export const metadata: Metadata = { title: "Event operations" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function EventsAdminPage({ searchParams }: PageProps) {
  await requireEventManager();
  const admin = getPhaseOneAdminClient();
  const [eventsResult, timeslotsResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("id, title, slug, venue, has_sign_in_pin, has_sign_out_pin, briefing_available_at, is_published, updated_at")
      .order("updated_at", { ascending: false })
      .limit(200),
    admin
      .from("phaseone_event_timeslots")
      .select("id, event_id, label, starts_at, ends_at, status, sort_order")
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(20000),
  ]);

  if (eventsResult.error || !eventsResult.data || timeslotsResult.error || !timeslotsResult.data) {
    console.error("Unable to load event operations", {
      eventsCode: eventsResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
    });
    throw new Error("Event operations could not be loaded");
  }

  const timeslotsByEvent = new Map<string, VolunteerTimeslot[]>();
  timeslotsResult.data.forEach((timeslot) => {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot as VolunteerTimeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  });

  const events = eventsResult.data
    .map((event) => ({ ...event, timeslots: sortTimeslots(timeslotsByEvent.get(event.id) ?? []) }))
    .sort((left, right) =>
      (left.timeslots[0]?.starts_at ?? "9999").localeCompare(
        right.timeslots[0]?.starts_at ?? "9999",
      ),
    );
  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Event operations" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Phase-one operations</p>
            <h1>Manage event guides</h1>
            <p className="muted">Configure schedules, briefing release, attendance links, separate PINs and volunteer rosters.</p>
          </div>
          <Link className="button button-primary" href="/admin/events/new">New event guide</Link>
        </div>

        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <div className="table-wrap">
          <table className="content-table">
            <thead><tr><th>Event</th><th>Schedule</th><th>Access</th><th>Visibility</th><th>Actions</th></tr></thead>
            <tbody>
              {events.map((event) => {
                const first = event.timeslots[0];
                return (
                  <tr key={event.id}>
                    <td><strong>{event.title}</strong><span className="table-subtext">/journey/{event.slug}</span></td>
                    <td>
                      {first ? `${formatTimeslotDate(first.starts_at)} · ${formatTimeslotTimeRange(first)}` : "Not set"}
                      {event.timeslots.length > 1 ? <span className="table-subtext">{event.timeslots.length} timeslots</span> : null}
                    </td>
                    <td>{event.has_sign_in_pin && event.has_sign_out_pin ? "Both PINs configured" : "Configuration incomplete"}</td>
                    <td><span className="status-pill">{getPackageListingStatus(event.timeslots, event.is_published)}</span></td>
                    <td>
                      <div className="actions">
                        <Link className="text-link" href={`/admin/events/${event.id}/edit`}>Edit</Link>
                        <form action={duplicateEvent}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <button className="text-link button-reset" type="submit">Duplicate journey</button>
                        </form>
                        {event.is_published ? (
                          <Link className="text-link" href={`/journey/${event.slug}`} target="_blank">View event guide</Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {events.length === 0 ? <tr><td colSpan={5}>No event guides have been created.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
