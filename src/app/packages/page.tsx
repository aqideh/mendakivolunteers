import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import {
  getVisibleVolunteerPackages,
  type VolunteerPackage,
} from "@/lib/phaseone/packages";

import styles from "./packages.module.css";

export const metadata: Metadata = {
  title: "Volunteer packages",
  description: "Access briefing, sign-in and sign-out resources for MENDAKI volunteer events.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function PackageCard({ volunteerPackage }: { volunteerPackage: VolunteerPackage }) {
  const ready = volunteerPackage.has_sign_in_pin && volunteerPackage.has_sign_out_pin;

  return (
    <article className={styles.card}>
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
        <h3>{volunteerPackage.title}</h3>
        <dl className="phaseone-opportunity-details">
          <div>
            <dt>Venue</dt>
            <dd>{volunteerPackage.venue ?? "Check with the event team"}</dd>
          </div>
          <div>
            <dt>Access</dt>
            <dd>{ready ? "Sign-in and sign-out ready" : "Not available yet"}</dd>
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
  );
}

function PackageSection({
  title,
  packages,
  emptyMessage,
}: {
  title: string;
  packages: VolunteerPackage[];
  emptyMessage: string;
}) {
  return (
    <section className="section" aria-labelledby={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>
      <h2 id={`${title.toLowerCase().replaceAll(" ", "-")}-title`}>{title}</h2>
      {packages.length > 0 ? (
        <div className={styles.list}>
          {packages.map((volunteerPackage) => (
            <PackageCard key={volunteerPackage.id} volunteerPackage={volunteerPackage} />
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

export default async function PackagesPage() {
  const packages = await getVisibleVolunteerPackages();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer packages" lite />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">Volunteer event resources</p>
          <h1>Your event packages.</h1>
          <p className="lede">
            Open an event package for its briefing, sign-in and sign-out resources.
            Access details are provided by the event team.
          </p>
        </section>

        <PackageSection
          title="Today’s packages"
          packages={packages.today}
          emptyMessage="There are no packages scheduled for today."
        />
        <PackageSection
          title="Upcoming packages"
          packages={packages.upcoming}
          emptyMessage="There are no upcoming packages."
        />
        <PackageSection
          title="Recently completed"
          packages={packages.recentlyCompleted}
          emptyMessage="There are no recently completed packages."
        />
      </main>
      <footer className="site-footer">
        Event packages are prepared and published by the MENDAKI event team.
      </footer>
    </div>
  );
}
