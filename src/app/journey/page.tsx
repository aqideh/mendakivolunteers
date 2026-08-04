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

import styles from "./journey.module.css";

export const metadata: Metadata = {
  title: "Your Volunteer Journey",
  description:
    "Find schedules, directions, preparation guidance, briefings, sign-in and sign-out resources for MENDAKI volunteer events.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

function DateBadge({ volunteerEvent }: { volunteerEvent: VolunteerPackage }) {
  const first = volunteerEvent.timeslots[0];
  const last = volunteerEvent.timeslots.at(-1) ?? first;
  const firstDate = new Date(first.starts_at);
  const lastDate = new Date(last.starts_at);
  const dateKeys = [
    ...new Set(
      volunteerEvent.timeslots.map((timeslot) =>
        singaporeDateKey(timeslot.starts_at),
      ),
    ),
  ];
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
        {!sameDay &&
        consecutive &&
        monthFormatter.format(firstDate) !== monthFormatter.format(lastDate)
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

function EventGuideCard({ volunteerEvent }: { volunteerEvent: VolunteerPackage }) {
  const directions = buildDirectionsLinks(volunteerEvent.navigation_destination);
  const now = new Date().toISOString();
  const first =
    volunteerEvent.timeslots.find(
      (timeslot) =>
        timeslot.status === "scheduled" &&
        (timeslot.ends_at ?? timeslot.starts_at) >= now,
    ) ?? volunteerEvent.timeslots[0];
  const dateCount = new Set(
    volunteerEvent.timeslots.map((timeslot) =>
      singaporeDateKey(timeslot.starts_at),
    ),
  ).size;
  const scheduleSummary =
    volunteerEvent.timeslots.length === 1
      ? `${formatTimeslotDate(first.starts_at)} · ${formatTimeslotTimeRange(first)}`
      : dateCount === 1
        ? `${volunteerEvent.timeslots.length} timeslots · ${formatTimeslotDate(first.starts_at)}`
        : `${volunteerEvent.timeslots.length} timeslots across ${dateCount} days`;

  return (
    <article className={styles.card}>
      <DateBadge volunteerEvent={volunteerEvent} />
      <div className={styles.body}>
        <p className="phaseone-opportunity-date">{scheduleSummary}</p>
        {volunteerEvent.timeslots.length > 1 ? (
          <p className={styles.nextTimeslot}>
            Next: {formatTimeslotDate(first.starts_at)} ·{" "}
            {formatTimeslotTimeRange(first)}
          </p>
        ) : null}
        <h3>{volunteerEvent.title}</h3>
        <dl className="phaseone-opportunity-details">
          <div>
            <dt>Venue</dt>
            <dd>{volunteerEvent.venue}</dd>
          </div>
        </dl>
        <div
          className={styles.directionLinks}
          aria-label={`Directions to ${volunteerEvent.venue}`}
        >
          <a href={directions.appleMaps} target="_blank" rel="noopener noreferrer">
            Apple Maps
          </a>
          <a href={directions.googleMaps} target="_blank" rel="noopener noreferrer">
            Google Maps
          </a>
        </div>
        <Link
          className={`button button-primary ${styles.cta}`}
          href={`/journey/${volunteerEvent.slug}`}
        >
          View event guide
        </Link>
      </div>
    </article>
  );
}

function JourneySection({
  title,
  events,
  emptyMessage,
}: {
  title: string;
  events: VolunteerPackage[];
  emptyMessage: string;
}) {
  const id = `${title.toLowerCase().replaceAll(" ", "-")}-title`;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      {events.length > 0 ? (
        <div className={styles.list}>
          {events.map((volunteerEvent) => (
            <EventGuideCard key={volunteerEvent.id} volunteerEvent={volunteerEvent} />
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

export default async function JourneyPage() {
  const events = await getVisibleVolunteerPackages();

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Your Volunteer Journey" lite />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">Before, during and after volunteering</p>
          <h1>Your Volunteer Journey.</h1>
          <p className="lede">
            Find the schedule, briefing, directions and event-day steps for MENDAKI
            volunteer activities.
          </p>
        </section>

        <JourneySection
          title="Today"
          events={events.today}
          emptyMessage="There are no volunteer events scheduled for today."
        />
        <JourneySection
          title="Upcoming"
          events={events.upcoming}
          emptyMessage="There are no upcoming volunteer events."
        />
        <JourneySection
          title="Recently completed"
          events={events.recentlyCompleted}
          emptyMessage="There are no recently completed volunteer events."
        />
      </main>
      <footer className="site-footer">
        Event guides are prepared and published by the MENDAKI event team.
      </footer>
    </div>
  );
}
