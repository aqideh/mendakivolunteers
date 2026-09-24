import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { duplicateEvent } from "@/app/admin/events/actions";
import { creditManualEventHours } from "@/app/admin/events/manual-actions";
import { EventForm, type EventFormValue } from "@/components/phaseone/event-form";
import { ProgrammeRundownManager } from "@/components/phaseone/programme-rundown-manager";
import { RosterUpload } from "@/components/phaseone/roster-upload";
import { PortalHeader } from "@/components/portal-header";
import { hasProgrammeManagerRole, requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { programmeRundownBucket } from "@/lib/phaseone/programme-rundown";

export const metadata: Metadata = { title: "Edit programme" };
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
  event_created: "Event guide created.",
  event_updated: "Event guide updated.",
  event_duplicated: "Journey duplicated as a draft. Update its title, slug, dates and access settings before publishing.",
  roster_imported: "Roster imported.",
  manual_event_created: "Manual Event Operations event created. Upload the roster below.",
};

export default async function EditEventPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { roles } = await requireEventManager(`/admin/events/${id}/edit`);\n  const canManageProgramme = hasProgrammeManagerRole(roles);
  const admin = getPhaseOneAdminClient();

  const [eventResult, timeslotsResult, rosterCountResult, importsResult, rundownImagesResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("id, title, slug, venue, navigation_destination, attire_notes, preparation_notes, programme_rundown_url, briefing_url, briefing_available_at, whatsapp_url, sign_in_url, sign_out_url, has_sign_in_pin, has_sign_out_pin, is_published, opportunity_summary, opportunity_description, opportunity_image_url, opportunity_category, opportunity_eligibility, registration_deadline, opportunity_sort_order, is_opportunity_published, operations_scope, credit_contribution_hours")
      .eq("id", id)
      .maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at, status, sort_order, registration_capacity")
      .eq("event_id", id)
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
    admin
      .from("phaseone_roster")
      .select("id", { count: "exact", head: true })
      .eq("event_id", id),
    admin
      .from("phaseone_roster_imports")
      .select("id, mode, file_name, row_count, replaced_count, integration_mode, linked_volunteer_count, created_volunteer_count, uploaded_at")
      .eq("event_id", id)
      .order("uploaded_at", { ascending: false })
      .limit(10),
    admin
      .from("phaseone_event_rundown_images")
      .select("id, storage_path, original_file_name, sort_order, created_at")
      .eq("event_id", id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (eventResult.error) {
    console.error("Unable to load event guide editor", { code: eventResult.error.code, id });
    throw new Error("Event guide editor could not be loaded");
  }
  if (!eventResult.data) notFound();
  if (
    timeslotsResult.error ||
    !timeslotsResult.data ||
    rosterCountResult.error ||
    importsResult.error ||
    !importsResult.data
  ) {
    throw new Error("Event operations data could not be loaded");
  }
  if (rundownImagesResult.error && rundownImagesResult.error.code !== "42P01") {
    console.error("Unable to load programme rundown images", {
      code: rundownImagesResult.error.code,
      id,
    });
    throw new Error("Programme rundown images could not be loaded");
  }

  const parameters = await searchParams;
  const errorMessage = parameter(parameters, "error");
  const successCode = parameter(parameters, "success");
  const successMessage =
    successCode === "manual_hours_credited"
      ? `${parameter(parameters, "credited") ?? "0"} completed attendance session(s) credited for ${parameter(parameters, "hours") ?? "0"} KELUARGA contribution hours.${Number(parameter(parameters, "skipped") ?? "0") > 0 ? ` ${parameter(parameters, "skipped")} session(s) were skipped because they were not linked to exactly one KELUARGA volunteer.` : ""}`
      : successCode
        ? successMessages[successCode]
        : undefined;
  const operationsScope = eventResult.data.operations_scope as
    | "canonical"
    | "manual_isolated"
    | "manual_integrated";
  const creditContributionHours = Boolean(
    eventResult.data.credit_contribution_hours,
  );
  const event = {
    ...eventResult.data,
    timeslots: timeslotsResult.data,
  } as EventFormValue;
  const rundownImages = (rundownImagesResult.data ?? []).map((image) => ({
    id: String(image.id),
    fileName: image.original_file_name ? String(image.original_file_name) : null,
    url: admin.storage
      .from(programmeRundownBucket)
      .getPublicUrl(String(image.storage_path)).data.publicUrl,
  }));

  return (
    <div className="site-shell">
      <PortalHeader status="Edit programme" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Event operations</p>
            <h1>{event.title}</h1>
            <p className="muted">Manage the opportunity listing, Event Guide, roster and attendance from one programme record.</p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/events">All events</Link>
            <Link className="button button-secondary" href={`/admin/registrations?event=${id}`}>Registrations</Link>
            <Link className="button button-secondary" href={`/admin/events/${id}/insights`}>Volunteer insights</Link>
            <Link className="button button-primary" href={`/admin/events/${id}/attendance`}>Attendance</Link>
            {event.is_published ? <Link className="button" href={`/journey/${event.slug}`}>View guide</Link> : null}
          </div>
        </div>

        <nav className="phaseone-task-nav" aria-label="Event editor sections">
          {canManageProgramme ? (
            <>
              <a href="#guide">Guide · {event.is_published ? "Published" : "Draft"}</a>
              <a href="#programme">Programme · {rundownImages.length}</a>
            </>
          ) : null}
          <a href="#roster">Roster · {rosterCountResult.count ?? 0}</a>
          <Link href={`/admin/registrations?event=${id}`}>Registrations</Link>
          <Link href={`/admin/events/${id}/insights`}>Insights</Link>
          <Link href={`/admin/events/${id}/attendance`}>Attendance</Link>
          <Link href={`/admin/events/${id}/attendance/monitor`}>Live monitor</Link>
          <Link href={`/admin/events/${id}/attendance/reconcile`}>Reconcile</Link>
        </nav>

        {successMessage ? <div className="notice notice-success" role="status">{successMessage}</div> : null}
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        {canManageProgramme ? (\n          <>\n        <section className="panel phaseone-admin-section" id="guide" aria-labelledby="event-details-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Guide details</p>
              <h2 id="event-details-title">What volunteers need to know</h2>
            </div>
            <span className="status-pill">{event.is_published ? "Published" : "Draft"}</span>
          </div>
          <EventForm event={event} />
        </section>

        <section className="section panel phaseone-admin-section" id="programme" aria-labelledby="rundown-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Programme</p>
              <h2 id="rundown-title">Programme rundown</h2>
            </div>
            <span className="status-pill">{rundownImages.length} images</span>
          </div>
          <ProgrammeRundownManager
            eventId={event.id}
            images={rundownImages}
            legacyUrl={event.programme_rundown_url}
          />
        </section>

          </>\n        ) : (\n          <div className="notice">\n            Event Operations access is active. Programme, opportunity and Event Guide settings are read-only for this account.\n          </div>\n        )}\n\n        <section className="section panel phaseone-admin-section" id="roster" aria-labelledby="roster-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Roster</p>
              <h2 id="roster-title">Add volunteers</h2>
            </div>
            <span className="status-pill">{rosterCountResult.count ?? 0} assignments</span>
          </div>
          {operationsScope !== "canonical" ? (
            <div className={operationsScope === "manual_integrated" ? "notice notice-success" : "notice"}>
              <strong>
                {operationsScope === "manual_integrated"
                  ? "Manual event · included in KELUARGA"
                  : "Manual event · isolated"}
              </strong>
              <p>
                {operationsScope === "manual_integrated"
                  ? creditContributionHours
                    ? "CSV volunteers are linked or registered in the main volunteer database. Completed attendance can be credited as KELUARGA contribution hours below."
                    : "CSV volunteers are linked or registered in the main volunteer database. Contribution-hour crediting is disabled for this event."
                  : "Roster, attendance, insights and reporting stay inside this event. No main volunteer records or contribution hours are created."}
              </p>
            </div>
          ) : null}

          <RosterUpload
            eventId={event.id}
            operationsScope={operationsScope}
            timeslots={timeslotsResult.data}
          />

          {operationsScope === "manual_integrated" && creditContributionHours ? (
            <div className="panel">
              <p className="eyebrow">Contribution hours</p>
              <h3>Credit completed attendance to KELUARGA</h3>
              <p className="muted">
                Run this after check-out or attendance corrections. It creates or
                refreshes app-owned KELUARGA contribution-hour credits from completed
                attendance sessions. These remain separate from YM Hub verified hours.
              </p>
              <form action={creditManualEventHours}>
                <input name="eventId" type="hidden" value={event.id} />
                <button className="button button-primary" type="submit">
                  Credit completed hours
                </button>
              </form>
            </div>
          ) : null}

          <details className="phaseone-disclosure phaseone-import-history">
            <summary>Recent roster imports</summary>
            <div className="phaseone-disclosure-body">
              <div className="table-wrap">
                <table className="content-table">
                  <thead><tr><th>Uploaded</th><th>File</th><th>Mode</th><th>Data</th><th>Rows</th><th>Linked</th><th>New</th><th>Replaced</th></tr></thead>
                  <tbody>
                    {importsResult.data.map((item) => (
                      <tr key={item.id}>
                        <td>{formatSingaporeDateTime(item.uploaded_at)}</td>
                        <td>{item.file_name}</td>
                        <td>{item.mode}</td>
                        <td>{item.integration_mode === "volunteer_database" ? "KELUARGA" : "Event only"}</td>
                        <td>{item.row_count}</td>
                        <td>{item.linked_volunteer_count}</td>
                        <td>{item.created_volunteer_count}</td>
                        <td>{item.replaced_count}</td>
                      </tr>
                    ))}
                    {importsResult.data.length === 0 ? <tr><td colSpan={8}>No roster imports yet.</td></tr> : null}
                  </tbody>
                </table>
              </div>
            </div>
          </details>
        </section>

        {canManageProgramme ? (
          <details className="phaseone-disclosure phaseone-page-tools">
            <summary>More event actions</summary>
            <div className="phaseone-disclosure-body">
              <form action={duplicateEvent}>
                <input type="hidden" name="eventId" value={event.id} />
                <button className="button button-secondary" type="submit">Duplicate event guide</button>
              </form>
            </div>
          </details>
        ) : null}
      </main>
    </div>
  );
}
