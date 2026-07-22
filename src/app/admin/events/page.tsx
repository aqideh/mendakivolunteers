import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

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
  const { data: events, error } = await admin
    .from("phaseone_events")
    .select("id, title, slug, reporting_at, venue, has_pin, is_published, updated_at")
    .order("reporting_at", { ascending: true, nullsFirst: false })
    .limit(200);

  if (error || !events) {
    console.error("Unable to load event operations", { code: error?.code });
    throw new Error("Event operations could not be loaded");
  }

  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Event operations" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Phase-one operations</p>
            <h1>Manage volunteer events</h1>
            <p className="muted">Configure event access, attendance destinations and volunteer rosters.</p>
          </div>
          <Link className="button button-primary" href="/admin/events/new">New event</Link>
        </div>

        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <div className="table-wrap">
          <table className="content-table">
            <thead><tr><th>Event</th><th>Reporting</th><th>Access</th><th>Status</th><th>Action</th></tr></thead>
            <tbody>
              {events.map((event) => (
                <tr key={event.id}>
                  <td><strong>{event.title}</strong><span className="table-subtext">/events/{event.slug}</span></td>
                  <td>{event.reporting_at ? formatSingaporeDateTime(event.reporting_at) : "Not set"}</td>
                  <td>{event.has_pin ? "PIN configured" : "Not configured"}</td>
                  <td><span className="status-pill">{event.is_published ? "Published" : "Draft"}</span></td>
                  <td><Link className="text-link" href={`/admin/events/${event.id}/edit`}>Edit</Link></td>
                </tr>
              ))}
              {events.length === 0 ? <tr><td colSpan={5}>No event records.</td></tr> : null}
            </tbody>
          </table>
        </div>
      </main>
    </div>
  );
}
