import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import {
  ProfessionalEventForm,
  type ProfessionalEventAdminValue,
} from "./professional-event-form";
import styles from "./professional-events-admin.module.css";

export const metadata: Metadata = { title: "Specialist events" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfessionalEventsAdminPage({ searchParams }: PageProps) {
  await requireContentManager({ next: "/admin/content/professional-events" });
  const params = await searchParams;
  const success = readParam(params, "success");
  const error = readParam(params, "error");

  const admin = getPhaseOneAdminClient();
  const { data, error: loadError } = await admin
    .schema("content")
    .from("professional_events")
    .select("id, title, summary, starts_at, ends_at, venue, cta_label, is_published, sort_order")
    .order("sort_order", { ascending: true })
    .order("starts_at", { ascending: true, nullsFirst: false })
    .order("title", { ascending: true });

  if (loadError || !data) {
    console.error("Unable to load professional events admin", { code: loadError?.code });
    throw new Error("Professional events could not be loaded.");
  }

  const events = data as ProfessionalEventAdminValue[];

  return (
    <div className="site-shell">
      <PortalHeader status="Specialist events" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Specialist events</h1>
            <p className="muted">
              Manage event cards shown below the fold on the Specialist landing page. This is a
              separate content stream from volunteer opportunities and Event Operations.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/specialist">
              View public page
            </Link>
            <Link className="button button-secondary" href="/admin">
              Back to Admin
            </Link>
          </div>
        </div>

        {success ? <div className="notice notice-success" role="status">{success}</div> : null}
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

        <section className="section">
          <div className="section-header">
            <div>
              <h2>Add Professional Network event</h2>
              <p className="muted">Create a standalone public event card.</p>
            </div>
          </div>
          <details className={styles.createDisclosure}>
            <summary className={styles.createSummary}>
              <div className={styles.createSummaryCopy}>
                <strong>Create a new event card</strong>
                <span>Use this when adding a new Specialist event to the public page.</span>
              </div>
              <span className={styles.createSummaryAction}>Add event</span>
            </summary>
            <div className={styles.createPanel}>
              <ProfessionalEventForm />
            </div>
          </details>
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <h2>Existing event cards</h2>
              <p className="muted">{events.length} event{events.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className={styles.eventList}>
            {events.map((event) => (
              <details className={styles.eventDisclosure} key={event.id}>
                <summary className={styles.eventSummary}>
                  <div className={styles.eventSummaryCopy}>
                    <span className={styles.eventTitle}>{event.title}</span>
                    <span className={styles.eventMeta}>
                      <span>{event.starts_at ? new Intl.DateTimeFormat("en-SG", { timeZone: "Asia/Singapore", day: "numeric", month: "short", year: "numeric" }).format(new Date(event.starts_at)) : "Date not set"}</span>
                      {event.venue ? <span>{event.venue}</span> : null}
                    </span>
                  </div>
                  <span className={styles.eventSummaryActions}>
                    <span className="status-pill" data-state={event.is_published ? "verified" : "pending"}>
                      {event.is_published ? "Published" : "Draft"}
                    </span>
                    <span className={styles.editLabel}>Edit</span>
                    <span className={styles.chevron} aria-hidden="true">⌄</span>
                  </span>
                </summary>
                <div className={styles.eventFormPanel}>
                  <ProfessionalEventForm event={event} />
                </div>
              </details>
            ))}
          </div>

          {events.length === 0 ? <p className="muted">No Professional Network events yet.</p> : null}
        </section>
      </main>
    </div>
  );
}
