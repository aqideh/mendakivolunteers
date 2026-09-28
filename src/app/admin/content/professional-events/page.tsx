import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import {
  ProfessionalEventForm,
  type ProfessionalEventAdminValue,
} from "./professional-event-form";

export const metadata: Metadata = { title: "Professional events" };
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
      <PortalHeader status="Professional events" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Professional events</h1>
            <p className="muted">
              Manage event cards shown below the fold on the Professionals landing page. This is a
              separate content stream from volunteer opportunities and Event Operations.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/professionals">
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
          <ProfessionalEventForm />
        </section>

        <section className="section">
          <div className="section-header">
            <div>
              <h2>Existing event cards</h2>
              <p className="muted">{events.length} event{events.length === 1 ? "" : "s"}</p>
            </div>
          </div>

          <div className="card-grid">
            {events.map((event) => (
              <article className="card" key={event.id}>
                <div className="section-header">
                  <div>
                    <h3>{event.title}</h3>
                    <p className="muted">{event.is_published ? "Published" : "Draft"}</p>
                  </div>
                </div>
                <ProfessionalEventForm event={event} />
              </article>
            ))}
          </div>

          {events.length === 0 ? <p className="muted">No Professional Network events yet.</p> : null}
        </section>
      </main>
    </div>
  );
}
