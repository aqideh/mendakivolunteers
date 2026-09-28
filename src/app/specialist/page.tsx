import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import { getPublishedProfessionalEvents } from "@/lib/content/professional-events";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Specialist | Keluarga MENDAKI",
  description:
    "Join a community of professionals who connect, share knowledge and give back through MENDAKI's Professional Networks.",
};

function eventDateLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Date to be announced";
  if (!endsAt) return formatSingaporeDateTime(startsAt);
  return `${formatSingaporeDateTime(startsAt)} – ${formatSingaporeDateTime(endsAt)}`;
}

export default async function ProfessionalsPage() {
  const [heroImage, events] = await Promise.all([
    getLandingPageImage("specialist"),
    getPublishedProfessionalEvents(),
  ]);

  const eventsSection =
    events.length > 0 ? (
      <section
        className="phaseone-opportunity-list phaseone-opportunities-grid phaseone-opportunities-peek"
        aria-label="Professional Network events"
      >
        {events.map((event) => (
          <article className="phaseone-opportunity-card" key={event.id}>
            <div className="phaseone-opportunity-image" aria-hidden="true">
              <span>MENDAKI</span>
            </div>

            <div className="phaseone-opportunity-body">
              <div className="phaseone-opportunity-pills" aria-label="Event details">
                <span>{eventDateLabel(event.starts_at, event.ends_at)}</span>
                {event.venue ? <span>{event.venue}</span> : null}
              </div>

              <div className="phaseone-opportunity-heading">
                <h2>{event.title}</h2>
              </div>

              <p className="phaseone-opportunity-summary">{event.summary}</p>

              <div className="phaseone-opportunity-card-footer">
                <span className="phaseone-opportunity-social-empty">
                  Professional Network event
                </span>

                <button
                  className="button button-primary phaseone-opportunity-cta"
                  type="button"
                  disabled
                  aria-disabled="true"
                >
                  {event.cta_label}
                  <span aria-hidden="true">→</span>
                </button>
              </div>
            </div>
          </article>
        ))}
      </section>
    ) : null;

  return (
    <RoleLanding
      title="Your Experience Can Open Doors"
      description="Join a community of professionals who connect, share knowledge and give back. Support events and initiatives, share your experience, or simply get involved and build connections with others in your industry."
      heroImage={heroImage}
      inlineCta={{
        href: "https://professionalnetworksuat.mendaki.org.sg/",
        label: "Discover Professional Networks",
      }}
      items={[]}
      ctas={[{ href: "https://form.gov.sg/6ab08df24e9cff0f3ac1af45", label: "Volunteer" }]}
      afterContent={eventsSection}
    />
  );
}
