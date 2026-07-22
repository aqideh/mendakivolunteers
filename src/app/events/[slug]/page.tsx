import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { EventPinForm } from "@/components/phaseone/event-pin-form";
import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import {
  eventAccessCookieName,
  readEventAccessToken,
} from "@/lib/phaseone/event-access";

export const dynamic = "force-dynamic";

type EventPageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string }>;
};

export default async function EventPage({ params, searchParams }: EventPageProps) {
  const { slug } = await params;
  const { access } = await searchParams;
  const supabase = getPhaseOneAdminClient();
  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, reporting_at, venue, briefing_url, whatsapp_url, pin_updated_at, has_pin",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load phase-one event", { code: error.code, slug });
    throw new Error("Event details could not be loaded");
  }
  if (!event) notFound();

  const cookieStore = await cookies();
  const claims = readEventAccessToken(
    cookieStore.get(eventAccessCookieName(event.id))?.value,
    getPhaseOneServerSecret(),
  );
  const hasAccess = Boolean(
    claims &&
      event.pin_updated_at &&
      claims.eventId === event.id &&
      claims.pinUpdatedAt === event.pin_updated_at,
  );

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Event access" />
      <main className="phaseone-frame">
        <Link className="back-link" href="/opportunities">
          ← Opportunities
        </Link>
        <article className="phaseone-event-card">
          <p className="phaseone-opportunity-date">Volunteer event</p>
          <h1>{event.title}</h1>
          <dl className="phaseone-opportunity-details">
            <div>
              <dt>Report</dt>
              <dd>{event.reporting_at ? formatSingaporeDateTime(event.reporting_at) : "Check with the event team"}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{event.venue ?? "Check with the event team"}</dd>
            </div>
          </dl>

          {access === "expired" ? (
            <p className="phaseone-form-error" role="alert">Your event access expired. Enter the PIN again.</p>
          ) : null}
          {access === "unavailable" ? (
            <p className="phaseone-form-error" role="alert">That event action has not been configured yet.</p>
          ) : null}

          {!event.has_pin ? (
            <div className="panel">
              <h2>Access not configured</h2>
              <p>The event team has not enabled volunteer sign-in and sign-out yet.</p>
            </div>
          ) : hasAccess ? (
            <div className="phaseone-event-actions">
              <a className="button button-primary" href={`/api/phaseone/events/${slug}/go/sign-in`}>
                Open sign-in
              </a>
              <a className="button" href={`/api/phaseone/events/${slug}/go/sign-out`}>
                Open sign-out
              </a>
              {event.briefing_url ? (
                <a className="button" href={event.briefing_url} target="_blank" rel="noopener noreferrer">
                  View briefing
                </a>
              ) : null}
              {event.whatsapp_url ? (
                <a className="button" href={event.whatsapp_url} target="_blank" rel="noopener noreferrer">
                  Open WhatsApp group
                </a>
              ) : null}
              <p className="phaseone-access-note">Access remains valid for 30 minutes or until the event PIN changes.</p>
            </div>
          ) : (
            <div className="panel">
              <h2>Enter the event PIN</h2>
              <p>Get the PIN from the event team. Failed attempts are rate-limited.</p>
              <EventPinForm slug={slug} />
            </div>
          )}
        </article>
      </main>
    </div>
  );
}
