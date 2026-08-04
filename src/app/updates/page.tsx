import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { buildDirectionsLinks } from "@/lib/phaseone/directions";
import {
  getVisibleVolunteerPackages,
  type VolunteerPackage,
} from "@/lib/phaseone/packages";

import styles from "../packages/packages.module.css";

export const metadata: Metadata = {
  title: "Volunteer updates",
  description:
    "Access directions, preparation guidance, briefing, sign-in and sign-out resources for MENDAKI volunteer events.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function UpdateCard({ volunteerPackage }: { volunteerPackage: VolunteerPackage }) {
  const ready = volunteerPackage.has_sign_in_pin && volunteerPackage.has_sign_out_pin;
  const directions = buildDirectionsLinks(volunteerPackage.navigation_destination);

  return (
    <article className={styles.card}>
      <div className={styles.date} aria-hidden="true">
        <span>
          {new Intl.DateTimeFormat("en-SG", {
            timeZone: "Asia/Singapore",
            month: "short",
          }).format(new Date(volunteerPackage.reporting_at))}
        </span>
        <strong>
          {new Intl.DateTimeFormat("en-SG", {
            timeZone: "Asia/Singapore",
            day: "2-digit",
          }).format(new Date(volunteerPackage.reporting_at))}
        </strong>
      </div>
      <div className={styles.body}>
        <p className="phaseone-opportunity-date">
          {formatSingaporeDateTime(volunteerPackage.reporting_at)}
        </p>
        <h3>{volunteerPackage.title}</h3>
        <dl className="phaseone-opportunity-details">
          <div>
            <dt>Venue</dt>
            <dd>{volunteerPackage.venue}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{ready ? "Sign-in and sign-out ready" : "Not available yet"}</dd>
          </div>
        </dl>
        <div className={styles.directionLinks} aria-label={`Directions to ${volunteerPackage.venue}`}>
          <a href={directions.appleMaps} target="_blank" rel="noopener noreferrer">
            Apple Maps
          </a>
          <a href={directions.googleMaps} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        </div>
        <Link
          className={`button button-primary ${styles.cta}`}
          href={`/updates/${volunteerPackage.slug}`}
        >
          View update
        </Link>
      </div>
    </article>
  );
}

function UpdateSection({
  title,
  packages,
  emptyMessage,
}: {
  title: string;
  packages: VolunteerPackage[];
  emptyMessage: string;
}) {
  const id = `${title.toLowerCase().replaceAll(" ", "-")}-title`;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {packages.length > 0 ? (
        <div className={styles.list}>
          {packages.map((volunteerPackage) => (
            <UpdateCard key={volunteerPackage.id} volunteerPackage={volunteerPackage} />
          ))}
        </div>
      ) : (
        <div className="panel empty-state phaseone-empty-state">
          <p className="muted">{emptyMessage}</p>
        </div>
      )}
    </section>
  );
}

export default async function UpdatesPage() {
  const packages = await getVisibleVolunteerPackages();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer updates" lite />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">Volunteer event resources</p>
          <h1>Your event updates.</h1>
          <p className="lede">
            Open an event update for directions, preparation guidance, briefing,
            sign-in and sign-out resources.
          </p>
        </section>

        <UpdateSection
          title="Today’s updates"
          packages={packages.today}
          emptyMessage="There are no updates scheduled for today."
        />
        <UpdateSection
          title="Upcoming updates"
          packages={packages.upcoming}
          emptyMessage="There are no upcoming updates."
        />
        <UpdateSection
          title="Recently completed"
          packages={packages.recentlyCompleted}
          emptyMessage="There are no recently completed updates."
        />
      </main>
      <footer className="site-footer">
        Event updates are prepared and published by the MENDAKI event team.
      </footer>
    </div>
  );
}
