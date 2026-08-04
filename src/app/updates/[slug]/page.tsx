import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PackageActionPinForm } from "@/components/phaseone/package-action-pin-form";
import { PortalHeader } from "@/components/portal-header";
import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import { evaluateBriefingAccess } from "@/lib/phaseone/package-briefing";
import {
  hasPackageActionAccess,
  packageActionCookieName,
  packageActionLabel,
  readPackageActionAccessToken,
  type PackageAction,
} from "@/lib/phaseone/package-action-access";
import { buildDirectionsLinks } from "@/lib/phaseone/directions";
import {
  formatTimeslotDayHeading,
  formatTimeslotTimeRange,
  singaporeDateKey,
  sortTimeslots,
  type VolunteerTimeslot,
} from "@/lib/phaseone/packages";

import styles from "../../packages/[slug]/package-detail.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

type UpdatePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string; action?: string }>;
};

const actions: PackageAction[] = ["sign-in", "sign-out"];

function actionConfiguration(
  volunteerPackage: {
    has_sign_in_pin: boolean;
    has_sign_out_pin: boolean;
    sign_in_pin_updated_at: string | null;
    sign_out_pin_updated_at: string | null;
  },
  action: PackageAction,
) {
  return action === "sign-in"
    ? {
        configured: volunteerPackage.has_sign_in_pin,
        updatedAt: volunteerPackage.sign_in_pin_updated_at,
      }
    : {
        configured: volunteerPackage.has_sign_out_pin,
        updatedAt: volunteerPackage.sign_out_pin_updated_at,
      };
}

function Schedule({ timeslots }: { timeslots: VolunteerTimeslot[] }) {
  const groups = new Map<string, VolunteerTimeslot[]>();
  timeslots.forEach((timeslot) => {
    const key = singaporeDateKey(timeslot.starts_at);
    groups.set(key, [...(groups.get(key) ?? []), timeslot]);
  });

  return (
    <section className={styles.scheduleSection} aria-labelledby="schedule-title">
      <p className="eyebrow">Event schedule</p>
      <h2 id="schedule-title">Reporting times</h2>
      <div className={styles.scheduleDays}>
        {[...groups.entries()].map(([dateKey, dayTimeslots]) => {
          const firstTimeslot = dayTimeslots.at(0);
          if (!firstTimeslot) return null;

          return (
            <section className={styles.scheduleDay} key={dateKey}>
              <h3>{formatTimeslotDayHeading(firstTimeslot.starts_at)}</h3>
              <div className={styles.scheduleSlots}>
                {dayTimeslots.map((timeslot) => (
                  <article
                    className={`${styles.scheduleSlot} ${
                      timeslot.status === "cancelled" ? styles.cancelledSlot : ""
                    }`}
                    key={timeslot.id}
                  >
                    <div>
                      <strong>{timeslot.label ?? "Volunteer timeslot"}</strong>
                      <p>{formatTimeslotTimeRange(timeslot)}</p>
                    </div>
                    {timeslot.status === "cancelled" ? (
                      <span className="status-pill">Cancelled</span>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </section>
  );
}

export default async function UpdatePage({ params, searchParams }: UpdatePageProps) {
  const { slug } = await params;
  const { access, action: actionParam } = await searchParams;
  const supabase = getPhaseOneAdminClient();
  const { data: volunteerPackage, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, venue, navigation_destination, attire_notes, preparation_notes, briefing_url, briefing_available_at, whatsapp_url, has_sign_in_pin, has_sign_out_pin, sign_in_pin_updated_at, sign_out_pin_updated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load volunteer update", { code: error.code, slug });
    throw new Error("Volunteer update details could not be loaded");
  }
  if (!volunteerPackage) notFound();

  const { data: timeslotData, error: timeslotError } = await supabase
    .from("phaseone_event_timeslots")
    .select("id, label, starts_at, ends_at, status, sort_order")
    .eq("event_id", volunteerPackage.id)
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (timeslotError || !timeslotData || timeslotData.length === 0) {
    console.error("Unable to load volunteer update schedule", {
      code: timeslotError?.code,
      slug,
    });
    throw new Error("Volunteer update schedule could not be loaded");
  }
  const timeslots = sortTimeslots(timeslotData as VolunteerTimeslot[]);

  const briefing = evaluateBriefingAccess({
    isPublished: true,
    briefingUrl: volunteerPackage.briefing_url,
    briefingAvailableAt: volunteerPackage.briefing_available_at,
  });
  const directions = buildDirectionsLinks(volunteerPackage.navigation_destination);

  const cookieStore = await cookies();
  const secret = getPhaseOneServerSecret();
  const actionStates = actions.map((action) => {
    const configuration = actionConfiguration(volunteerPackage, action);
    const claims = readPackageActionAccessToken(
      cookieStore.get(packageActionCookieName(volunteerPackage.id, action))?.value,
      secret,
    );
    return {
      action,
      configured: configuration.configured,
      unlocked: hasPackageActionAccess(
        claims,
        volunteerPackage.id,
        action,
        configuration.updatedAt,
      ),
    };
  });

  const errorAction = actions.includes(actionParam as PackageAction)
    ? (actionParam as PackageAction)
    : null;
  const signInState = actionStates.find(({ action }) => action === "sign-in");
  const signOutState = actionStates.find(({ action }) => action === "sign-out");

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer update" lite />
      <main className="phaseone-frame">
        <Link className="back-link" href="/updates">
          ← Updates
        </Link>
        <article className={styles.card}>
          <p className="phaseone-opportunity-date">Volunteer event update</p>
          <h1>{volunteerPackage.title}</h1>
          <dl className="phaseone-opportunity-details">
            <div>
              <dt>Timeslots</dt>
              <dd>{timeslots.length}</dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{volunteerPackage.venue}</dd>
            </div>
          </dl>

          <Schedule timeslots={timeslots} />

          {access === "expired" && errorAction ? (
            <p className="phaseone-form-error" role="alert">
              Your {packageActionLabel(errorAction).toLowerCase()} access expired. Enter that PIN again.
            </p>
          ) : null}
          {access === "unavailable" && errorAction ? (
            <p className="phaseone-form-error" role="alert">
              {packageActionLabel(errorAction)} has not been configured yet.
            </p>
          ) : null}

          <section className={styles.flowSection} aria-labelledby="volunteer-flow-title">
            <p className="eyebrow">What to do</p>
            <h2 id="volunteer-flow-title">Your volunteering flow</h2>
            <ol className={styles.flow}>
              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">1</span>
                <div className={styles.stepBody}>
                  <h3>Complete the online briefing</h3>
                  <p>Review the event briefing before reporting for your shift.</p>
                  {briefing.available ? (
                    <a
                      className="button button-primary"
                      href={`/api/phaseone/packages/${slug}/go/briefing`}
                      target="_blank"
                      rel="noopener noreferrer"
                      referrerPolicy="no-referrer"
                    >
                      View briefing
                    </a>
                  ) : (
                    <button
                      className={`button ${styles.briefingDisabled}`}
                      type="button"
                      disabled
                    >
                      Briefing not started
                    </button>
                  )}
                </div>
              </li>

              {volunteerPackage.whatsapp_url ? (
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">2</span>
                  <div className={styles.stepBody}>
                    <h3>Join the WhatsApp group</h3>
                    <p>Join the group for event-day announcements and instructions from the team.</p>
                    <a
                      className="button button-secondary"
                      href={volunteerPackage.whatsapp_url}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Join WhatsApp group
                    </a>
                  </div>
                </li>
              ) : null}

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">3</span>
                <div className={styles.stepBody}>
                  <h3>Prepare for the event</h3>
                  <p className={styles.notes}>{volunteerPackage.attire_notes}</p>
                  {volunteerPackage.preparation_notes ? (
                    <p className={styles.notes}>{volunteerPackage.preparation_notes}</p>
                  ) : null}
                </div>
              </li>

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">4</span>
                <div className={styles.stepBody}>
                  <h3>Travel to the venue</h3>
                  <p>{volunteerPackage.navigation_destination}</p>
                  <div className={styles.stepActions}>
                    <a className="button button-secondary" href={directions.appleMaps} target="_blank" rel="noopener noreferrer">Apple Maps</a>
                    <a className="button button-secondary" href={directions.googleMaps} target="_blank" rel="noopener noreferrer">Google Maps</a>
                  </div>
                </div>
              </li>

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">5</span>
                <div className={styles.stepBody}>
                  <h3>Check in when you arrive</h3>
                  <p className="phaseone-access-note">The sign-in PIN will be provided by staff when you arrive on-site.</p>
                  {!signInState?.configured ? (
                    <p>This action has not been enabled by the event team.</p>
                  ) : signInState.unlocked ? (
                    <>
                      <a className="button button-primary" href={`/api/phaseone/packages/${slug}/go/sign-in`} referrerPolicy="no-referrer">Open sign-in</a>
                      <p className="phaseone-access-note">Access remains valid for five minutes or until this PIN changes.</p>
                    </>
                  ) : (
                    <PackageActionPinForm slug={slug} action="sign-in" />
                  )}
                </div>
              </li>

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">6</span>
                <div className={styles.stepBody}>
                  <h3>Check out before you leave</h3>
                  <p className="phaseone-access-note">Get the sign-out PIN from staff and complete check-out before leaving the venue.</p>
                  {!signOutState?.configured ? (
                    <p>This action has not been enabled by the event team.</p>
                  ) : signOutState.unlocked ? (
                    <>
                      <a className="button button-primary" href={`/api/phaseone/packages/${slug}/go/sign-out`} referrerPolicy="no-referrer">Open sign-out</a>
                      <p className="phaseone-access-note">Access remains valid for five minutes or until this PIN changes.</p>
                    </>
                  ) : (
                    <PackageActionPinForm slug={slug} action="sign-out" />
                  )}
                </div>
              </li>
            </ol>
          </section>
        </article>
      </main>
    </div>
  );
}
