import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getUpcomingVolunteerPackages } from "@/lib/phaseone/packages";

import styles from "./packages.module.css";

export const metadata: Metadata = {
  title: "Volunteer packages",
  description: "Access briefing, sign-in and sign-out resources for upcoming MENDAKI volunteer events.",
};

export const dynamic = "force-dynamic";

export default async function PackagesPage() {
  const packages = await getUpcomingVolunteerPackages();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer packages" lite />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">Upcoming volunteer events</p>
          <h1>Your event packages.</h1>
          <p className="lede">
            Open an event package for its briefing, sign-in and sign-out resources.
            Access details are provided by the event team.
          </p>
        </section>

        {packages.length > 0 ? (
          <section className={styles.list} aria-label="Upcoming volunteer packages">
            {packages.map((volunteerPackage) => (
              <article className={styles.card} key={volunteerPackage.id}>
                <div className={styles.date} aria-hidden="true">
                  <span>{new Intl.DateTimeFormat("en-SG", {
                    timeZone: "Asia/Singapore",
                    month: "short",
                  }).format(new Date(volunteerPackage.reporting_at))}</span>
                  <strong>{new Intl.DateTimeFormat("en-SG", {
                    timeZone: "Asia/Singapore",
                    day: "2-digit",
                  }).format(new Date(volunteerPackage.reporting_at))}</strong>
                </div>
                <div className={styles.body}>
                  <p className="phaseone-opportunity-date">
                    {formatSingaporeDateTime(volunteerPackage.reporting_at)}
                  </p>
                  <h2>{volunteerPackage.title}</h2>
                  <dl className="phaseone-opportunity-details">
                    <div>
                      <dt>Venue</dt>
                      <dd>{volunteerPackage.venue ?? "Check with the event team"}</dd>
                    </div>
                    <div>
                      <dt>Access</dt>
                      <dd>{volunteerPackage.has_pin ? "PIN configured" : "Not available yet"}</dd>
                    </div>
                  </dl>
                  <Link
                    className={`button button-primary ${styles.cta}`}
                    href={`/packages/${volunteerPackage.slug}`}
                  >
                    View package
                  </Link>
                </div>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel empty-state phaseone-empty-state">
            <h2>No upcoming packages right now.</h2>
            <p className="muted">
              Packages will appear here after the event team publishes them.
            </p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        Event packages are prepared and published by the MENDAKI event team.
      </footer>
    </div>
  );
}
