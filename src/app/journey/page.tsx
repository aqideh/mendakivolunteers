import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import {
  getEventGuideViewer,
  getPermittedEventGuideIds,
} from "@/lib/phaseone/event-guide-access";
import { buildDirectionsLinks } from "@/lib/phaseone/directions";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
  getVisibleVolunteerPackages,
  singaporeDateKey,
  type VolunteerPackage,
  type VolunteerPackageGroups,
} from "@/lib/phaseone/packages";

import styles from "./journey.module.css";

export const metadata: Metadata = {
  title: "Event Guide",
  description:
    "View schedules, directions, preparation guidance, briefings and event-day steps for MENDAKI activities you are registered for.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type JourneyPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function filterGroups(
  groups: VolunteerPackageGroups,
  permittedEventIds: ReadonlySet<string> | null,
): VolunteerPackageGroups {
  if (!permittedEventIds) return groups;
  const permitted = (volunteerEvent: VolunteerPackage) =>
    permittedEventIds.has(volunteerEvent.id);
  return {
    today: groups.today.filter(permitted),
    upcoming: groups.upcoming.filter(permitted),
    recentlyCompleted: groups.recentlyCompleted.filter(permitted),
  };
}

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
        ? `${volunteerEvent.timeslots.length} shifts · ${formatTimeslotDate(first.starts_at)}`
        : `${volunteerEvent.timeslots.length} shifts across ${dateCount} days`;

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
          Open Event Guide
        </Link>
      </div>
    </article>
  );
}

function EventGuideSection({
  title,
  events,
}: {
  title: string;
  events: VolunteerPackage[];
}) {
  if (events.length === 0) return null;
  const id = `${title.toLowerCase().replaceAll(" ", "-")}-title`;
  return (
    <section className="section" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <div className={styles.list}>
        {events.map((volunteerEvent) => (
          <EventGuideCard key={volunteerEvent.id} volunteerEvent={volunteerEvent} />
        ))}
      </div>
    </section>
  );
}

export default async function JourneyPage({ searchParams }: JourneyPageProps) {
  const viewerResult = await getEventGuideViewer();
  if (viewerResult.state === "signed_out") {
    redirect(`/login?next=${encodeURIComponent("/journey")}`);
  }
  if (viewerResult.state === "inactive") {
    redirect("/login?error=account_inactive");
  }
  if (viewerResult.state === "unavailable") {
    throw new Error("Event Guide access could not be verified");
  }

  const [allEvents, permittedEventIds] = await Promise.all([
    getVisibleVolunteerPackages(),
    getPermittedEventGuideIds(viewerResult.viewer),
  ]);
  const events = filterGroups(allEvents, permittedEventIds);
  const hasCurrentRegistration = events.today.length > 0 || events.upcoming.length > 0;
  const parameters = await searchParams;
  const error = parameter(parameters, "error");

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Event Guide" dashboard />
      <main className="phaseone-frame">
        <section className="phaseone-intro">
          <p className="eyebrow">For activities you are registered for</p>
          <h1>Your Event Guides.</h1>
          <p className="lede">
            Find your reporting time, briefing, directions and event-day steps.
            KELUARGA and YM Hub use separate sign-ins, and registration updates may
            appear after the next data update.
          </p>
        </section>

        {viewerResult.viewer.isStaffPreview ? (
          <div className="notice" role="status">
            <strong>Staff preview.</strong> You can see all published Event Guides.
            Volunteers see only guides matched to their registration or event roster.
          </div>
        ) : null}

        {error === "not_registered" ? (
          <div className="notice notice-error" role="alert">
            That Event Guide is not available to this KELUARGA account. Sign in with
            the same email address used for the event registration, or contact the
            volunteer team if the registration was recent.
          </div>
        ) : null}

        {!viewerResult.viewer.isStaffPreview &&
        viewerResult.viewer.registrationSyncOutcome === "failed" ? (
          <div className="notice notice-error" role="status">
            The latest YM Hub registration update did not complete. Event roster
            matches are still shown while the data issue is being resolved.
          </div>
        ) : null}

        {!hasCurrentRegistration ? (
          <section className="panel empty-state phaseone-empty-state" aria-labelledby="no-events-title">
            <h2 id="no-events-title">No upcoming Event Guides</h2>
            <p>
              You are not registered for any upcoming events. Check out our
              available volunteer opportunities.
            </p>
            <Link className="button button-primary" href="/opportunities">
              View volunteer opportunities
            </Link>
          </section>
        ) : null}

        <EventGuideSection title="Today" events={events.today} />
        <EventGuideSection title="Upcoming" events={events.upcoming} />
        <EventGuideSection
          title="Recently completed"
          events={events.recentlyCompleted}
        />
      </main>
      <footer className="site-footer">
        Registration is managed in YM Hub. KELUARGA shows the latest available
        registration and event-roster information.
      </footer>
    </div>
  );
}
