import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { buildDirectionsLinks } from "@/lib/phaseone/directions";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
  getVisibleVolunteerPackages,
  singaporeDateKey,
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

function DateBadge({ volunteerPackage }: { volunteerPackage: VolunteerPackage }) {
  const first = volunteerPackage.timeslots[0];
  const last = volunteerPackage.timeslots.at(-1) ?? first;
  const firstDate = new Date(first.starts_at);
  const lastDate = new Date(last.starts_at);
  const dateKeys = [...new Set(
    volunteerPackage.timeslots.map((timeslot) => singaporeDateKey(timeslot.starts_at)),
  )];
  const sameDay = dateKeys.length === 1;
  const consecutive = dateKeys.every((dateKey, index) => {
    if (index === 0) return true;
    const previous = new Date(`${dateKeys[index - 1]}T00:00:00Z`);
    previous.setUTCDate(previous.getUTCDate() + 1);
    return previous.toISOString().slice(0, 10) === dateKey;
  });
  const monthFormatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    month: "short",
  });
  const dayFormatter = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
  });

  return (
    <div className={styles.date} aria-hidden="true">
      <span>
        {monthFormatter.format(firstDate)}
        {!sameDay && consecutive && monthFormatter.format(firstDate) !== monthFormatter.format(lastDate)
          ? `–${monthFormatter.format(lastDate)}`
          : ""}
      </span>
      <strong>
        {sameDay
          ? dayFormatter.format(firstDate)
          : consecutive
            ? `${dayFormatter.format(firstDate)}–${dayFormatter.format(lastDate)}`
            : `${dayFormatter.format(firstDate)}+`}
      </strong>
    </div>
  );
}

function UpdateCard({ volunteerPackage }: { volunteerPackage: VolunteerPackage }) {
  const ready = volunteerPackage.has_sign_in_pin && volunteerPackage.has_sign_out_pin;
  const directions = buildDirectionsLinks(volunteerPackage.navigation_destination);
  const now = new Date().toISOString();
  const first =
    volunteerPackage.timeslots.find(
      (timeslot) =>
        timeslot.status === "scheduled" &&
        (timeslot.ends_at ?? timeslot.starts_at) >= now,
    ) ?? volunteerPackage.timeslots[0];
  const dateCount = new Set(
    volunteerPackage.timeslots.map((timeslot) => singaporeDateKey(timeslot.starts_at)),
  ).size;
  const scheduleSummary =
    volunteerPackage.timeslots.length === 1
      ? `${formatTimeslotDate(first.starts_at)} · ${formatTimeslotTimeRange(first)}`
      : dateCount === 1
        ? `${volunteerPackage.timeslots.length} timeslots · ${formatTimeslotDate(first.starts_at)}`
        : `${volunteerPackage.timeslots.length} timeslots across ${dateCount} days`;

  return (
    <article className={styles.card}>
      <DateBadge volunteerPackage={volunteerPackage} />
      <div className={styles.body}>
        <p className="phaseone-opportunity-date">{scheduleSummary}</p>
        {volunteerPackage.timeslots.length > 1 ? (
          <p className={styles.nextTimeslot}>
            Next: {formatTimeslotDate(first.starts_at)} · {formatTimeslotTimeRange(first)}
          </p>
        ) : null}
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
          {volunteerPackage.timeslots.length > 1 ? "View all timeslots" : "View update"}
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
            Open an event update for its full schedule, directions, preparation guidance,
            briefing, sign-in and sign-out resources.
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
