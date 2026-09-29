import type { Metadata } from "next";

import { RoleLanding } from "@/components/role-landing";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getLandingPageImage } from "@/lib/content/landing-page-media";
import { getPublishedProfessionalEvents } from "@/lib/content/professional-events";

import styles from "../professionals/professionals.module.css";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Specialist | Keluarga MENDAKI",
  description:
    "Join a community of specialists who connect, share knowledge and give back through MENDAKI's Professional Networks.",
};

function eventDateLabel(startsAt: string | null, endsAt: string | null): string {
  if (!startsAt) return "Date to be announced";
  if (!endsAt) return formatSingaporeDateTime(startsAt);
  return `${formatSingaporeDateTime(startsAt)} – ${formatSingaporeDateTime(endsAt)}`;
}

export default async function SpecialistPage() {
  const [heroImage, events] = await Promise.all([
    getLandingPageImage("specialist"),
    getPublishedProfessionalEvents(),
  ]);

  const eventsSection = (
    <section
      className={`${styles.eventsSection} phaseone-opportunities-peek`}
      aria-label="Upcoming Professional Network events"
    >
      {events.length > 0 ? (
        <div className={styles.eventGrid}>
          {events.map((event) => (
            <article className={styles.eventCard} key={event.id}>
              <div className={styles.eventMeta}>
                <span>{eventDateLabel(event.starts_at, event.ends_at)}</span>
                {event.venue ? <span>{event.venue}</span> : null}
              </div>
              <h3>{event.title}</h3>
              <p>{event.summary}</p>
              <button className={styles.deadCta} type="button" disabled aria-disabled="true">
                <span>{event.cta_label}</span>
                <span aria-hidden="true">↗</span>
              </button>
            </article>
          ))}
        </div>
      ) : (
        <div className={styles.emptyState}>New Professional Network events will appear here.</div>
      )}
    </section>
  );

  return (
    <RoleLanding
      title="Your Experience Can Open Doors"
      description="Join a community of specialists who connect, share knowledge and give back. Support events and initiatives, share your experience, or simply get involved and build connections with others in your industry."
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
