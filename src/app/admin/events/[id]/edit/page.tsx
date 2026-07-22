import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventForm, type EventFormValue } from "@/components/phaseone/event-form";
import { RosterUpload } from "@/components/phaseone/roster-upload";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Edit event" };
export const dynamic = "force-dynamic";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

const successMessages: Record<string, string> = {
  event_created: "Event created.",
  event_updated: "Event updated.",
  roster_imported: "Roster imported.",
};

export default async function EditEventPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/edit`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, opportunitiesResult, rosterCountResult, importsResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("id, external_opportunity_id, title, slug, reporting_at, venue, briefing_url, whatsapp_url, sign_in_url, sign_out_url, has_pin, is_published")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("phaseone_external_opportunities")
      .select("id, title, starts_at")
      .eq("is_active", true)
      .order("starts_at", { ascending: true })
      .limit(200),
    admin
      .from("phaseone_roster")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id),
    admin
      .from("phaseone_roster_imports")
      .select("id, mode, file_name, row_count, replaced_count, uploaded_at")
      .eq("event_id", id)
      .order("uploaded_at", { ascending: false })
      .limit(10),
  ]);

  if (eventResult.error) {
    console.error("Unable to load event editor", { code: eventResult.error.code, id });
    throw new Error("Event editor could not be loaded");
  }
  if (!eventResult.data) notFound();
  if (opportunitiesResult.error || !opportunitiesResult.data || rosterCountResult.error || importsResult.error || !importsResult.data) {
    throw new Error("Event operations data could not be loaded");
  }

  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");
  const successCode = parameter(parameters, "success");
  const successMessage = successCode ? successMessages[successCode] : undefined;
  const event = eventResult.data as EventFormValue;

  return (
    <div className="site-shell">
      <PortalHeader status="Edit event" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Phase-one operations</p>
            <h1>{event.title}</h1>
            <p className="muted">Manage event details and the operational roster.</p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/events">All events</Link>
            <Link className="button button-primary" href={`/admin/events/${id}/attendance`}>Counter-check attendance</Link>
            {event.is_published ? <Link className="button" href={`/events/${event.slug}`}>View event page</Link> : null}
          </div>
        </div>

        {successMessage ? <div className="notice notice-success" role="status">{successMessage}</div> : null}
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <section className="panel phaseone-admin-section" aria-labelledby="event-details-title">
          <h2 id="event-details-title">Event configuration</h2>
          <EventForm event={event} opportunities={opportunitiesResult.data} />
        </section>

        <section className="section panel phaseone-admin-section" aria-labelledby="roster-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Volunteer roster</p>
              <h2 id="roster-title">CSV roster upload</h2>
            </div>
            <span className="status-pill">{rosterCountResult.count ?? 0} volunteers</span>
          </div>
          <RosterUpload eventId={event.id} />
        </section>

        <section className="section" aria-labelledby="imports-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Audit history</p>
              <h2 id="imports-title">Recent roster imports</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead><tr><th>Uploaded</th><th>File</th><th>Mode</th><th>Rows</th><th>Replaced</th></tr></thead>
              <tbody>
                {importsResult.data.map((item) => (
                  <tr key={item.id}>
                    <td>{formatSingaporeDateTime(item.uploaded_at)}</td>
                    <td>{item.file_name}</td>
                    <td>{item.mode}</td>
                    <td>{item.row_count}</td>
                    <td>{item.replaced_count}</td>
                  </tr>
                ))}
                {importsResult.data.length === 0 ? <tr><td colSpan={5}>No roster imports yet.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
