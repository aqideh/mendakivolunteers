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
import { evaluateBriefingAccess } from "@/lib/phaseone/package-briefing";

import styles from "./package-detail.module.css";

export const dynamic = "force-dynamic";

type PackagePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string }>;
};

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { slug } = await params;
  const { access } = await searchParams;
  const supabase = getPhaseOneAdminClient();
  const { data: volunteerPackage, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, reporting_at, venue, briefing_url, briefing_available_at, pin_updated_at, has_pin",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load volunteer package", { code: error.code, slug });
    throw new Error("Volunteer package details could not be loaded");
  }
  if (!volunteerPackage) notFound();

  const briefing = evaluateBriefingAccess({
    isPublished: true,
    briefingUrl: volunteerPackage.briefing_url,
    briefingAvailableAt: volunteerPackage.briefing_available_at,
  });

  const cookieStore = await cookies();
  const claims = readEventAccessToken(
    cookieStore.get(eventAccessCookieName(volunteerPackage.id))?.value,
    getPhaseOneServerSecret(),
  );
  const hasAttendanceAccess = Boolean(
    claims &&
      volunteerPackage.pin_updated_at &&
      claims.eventId === volunteerPackage.id &&
      claims.pinUpdatedAt === volunteerPackage.pin_updated_at,
  );

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer package" lite />
      <main className="phaseone-frame">
        <Link className="back-link" href="/packages">
          ← Packages
        </Link>
        <article className={styles.card}>
          <p className="phaseone-opportunity-date">Volunteer event package</p>
          <h1>{volunteerPackage.title}</h1>
          <dl className="phaseone-opportunity-details">
            <div>
              <dt>Report</dt>
              <dd>
                {volunteerPackage.reporting_at
                  ? formatSingaporeDateTime(volunteerPackage.reporting_at)
                  : "Check with the event team"}
              </dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{volunteerPackage.venue ?? "Check with the event team"}</dd>
            </div>
          </dl>

          {briefing.available ? (
            <a
              className={`button button-primary ${styles.briefing}`}
              href={`/api/phaseone/packages/${slug}/go/briefing`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View briefing
            </a>
          ) : (
            <button
              className={`button ${styles.briefing} ${styles.briefingDisabled}`}
              type="button"
              disabled
            >
              Briefing not started
            </button>
          )}

          {access === "expired" ? (
            <p className="phaseone-form-error" role="alert">
              Your event access expired. Enter the PIN again.
            </p>
          ) : null}
          {access === "unavailable" ? (
            <p className="phaseone-form-error" role="alert">
              That event action has not been configured yet.
            </p>
          ) : null}

          {!volunteerPackage.has_pin ? (
            <div className={`panel ${styles.accessPanel}`}>
              <h2>Attendance access not configured</h2>
              <p>The event team has not enabled volunteer sign-in and sign-out yet.</p>
            </div>
          ) : hasAttendanceAccess ? (
            <div className={styles.attendance}>
              <a
                className="button button-primary"
                href={`/api/phaseone/events/${slug}/go/sign-in`}
              >
                Sign in
              </a>
              <a
                className="button button-secondary"
                href={`/api/phaseone/events/${slug}/go/sign-out`}
              >
                Sign out
              </a>
            </div>
          ) : (
            <div className={`panel ${styles.accessPanel}`}>
              <h2>Unlock attendance</h2>
              <p>Get the event PIN from the event team. Failed attempts are rate-limited.</p>
              <EventPinForm slug={slug} />
            </div>
          )}
        </article>
      </main>
    </div>
  );
}
