import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PackageActionPinForm } from "@/components/phaseone/package-action-pin-form";
import { ProgrammeRundownGallery } from "@/components/phaseone/programme-rundown-gallery";
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
import { programmeRundownBucket } from "@/lib/phaseone/programme-rundown";

import styles from "./journey-detail.module.css";

export const dynamic = "force-dynamic";
export const metadata = {
  robots: { index: false, follow: false },
  referrer: "no-referrer" as const,
};

type EventGuidePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string; action?: string }>;
};

const actions: PackageAction[] = ["sign-in", "sign-out"];

function actionConfiguration(
  volunteerEvent: {
    has_sign_in_pin: boolean;
    has_sign_out_pin: boolean;
    sign_in_pin_updated_at: string | null;
    sign_out_pin_updated_at: string | null;
  },
  action: PackageAction,
) {
  return action === "sign-in"
    ? { configured: volunteerEvent.has_sign_in_pin, updatedAt: volunteerEvent.sign_in_pin_updated_at }
    : { configured: volunteerEvent.has_sign_out_pin, updatedAt: volunteerEvent.sign_out_pin_updated_at };
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
                    className={`${styles.scheduleSlot} ${timeslot.status === "cancelled" ? styles.cancelledSlot : ""}`}
                    key={timeslot.id}
                  >
                    <div>
                      <strong>{timeslot.label ?? "Volunteer timeslot"}</strong>
                      <p>{formatTimeslotTimeRange(timeslot)}</p>
                    </div>
                    {timeslot.status === "cancelled" ? <span className="status-pill">Cancelled</span> : null}
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

export default async function EventGuidePage({ params, searchParams }: EventGuidePageProps) {
  const { slug } = await params;
  const { access, action: actionParam } = await searchParams;
  const supabase = getPhaseOneAdminClient();
  const { data: volunteerEvent, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, venue, navigation_destination, attire_notes, preparation_notes, programme_rundown_url, briefing_url, briefing_available_at, whatsapp_url, has_sign_in_pin, has_sign_out_pin, sign_in_pin_updated_at, sign_out_pin_updated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load event guide", { code: error.code, slug });
    throw new Error("Event guide details could not be loaded");
  }
  if (!volunteerEvent) notFound();

  const [timeslotResult, rundownResult] = await Promise.all([
    supabase
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at, status, sort_order")
      .eq("event_id", volunteerEvent.id)
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("phaseone_event_rundown_images")
      .select("id, storage_path, sort_order, created_at")
      .eq("event_id", volunteerEvent.id)
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true }),
  ]);

  if (timeslotResult.error || !timeslotResult.data || timeslotResult.data.length === 0) {
    console.error("Unable to load event schedule", { code: timeslotResult.error?.code, slug });
    throw new Error("Event schedule could not be loaded");
  }
  if (rundownResult.error && rundownResult.error.code !== "42P01") {
    console.error("Unable to load programme rundown", { code: rundownResult.error.code, slug });
    throw new Error("Programme rundown could not be loaded");
  }

  const timeslots = sortTimeslots(timeslotResult.data as VolunteerTimeslot[]);
  const rundownImages = (rundownResult.data ?? []).map((image) => ({
    id: String(image.id),
    url: supabase.storage.from(programmeRundownBucket).getPublicUrl(String(image.storage_path)).data.publicUrl,
  }));
  const briefing = evaluateBriefingAccess({
    isPublished: true,
    briefingUrl: volunteerEvent.briefing_url,
    briefingAvailableAt: volunteerEvent.briefing_available_at,
  });
  const directions = buildDirectionsLinks(volunteerEvent.navigation_destination);

  const cookieStore = await cookies();
  const secret = getPhaseOneServerSecret();
  const actionStates = actions.map((action) => {
    const configuration = actionConfiguration(volunteerEvent, action);
    const claims = readPackageActionAccessToken(
      cookieStore.get(packageActionCookieName(volunteerEvent.id, action))?.value,
      secret,
    );
    return {
      action,
      configured: configuration.configured,
      unlocked: hasPackageActionAccess(
        claims,
        volunteerEvent.id,
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
  const hasWhatsapp = Boolean(volunteerEvent.whatsapp_url);
  const hasProgrammeRundown = rundownImages.length > 0 || Boolean(volunteerEvent.programme_rundown_url);
  const programmeRundownStep = 2 + Number(hasWhatsapp);
  const preparationStep = 2 + Number(hasWhatsapp) + Number(hasProgrammeRundown);
  const travelStep = preparationStep + 1;
  let nextStep = travelStep + 1;
  const signInStep = signInState?.configured ? nextStep++ : null;
  const signOutStep = signOutState?.configured ? nextStep : null;

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Event guide" lite />
      <main className="phaseone-frame">
        <Link className="back-link" href="/journey">← Your Volunteer Journey</Link>
        <article className={styles.card}>
          <p className="phaseone-opportunity-date">Volunteer event</p>
          <h1>{volunteerEvent.title}</h1>
          <dl className="phaseone-opportunity-details">
            <div><dt>Timeslots</dt><dd>{timeslots.length}</dd></div>
            <div><dt>Venue</dt><dd>{volunteerEvent.venue}</dd></div>
          </dl>

          <Schedule timeslots={timeslots} />

          {access === "expired" && errorAction ? (
            <p className="phaseone-form-error" role="alert">
              Your {packageActionLabel(errorAction).toLowerCase()} access expired. Enter that PIN again.
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
                    <a className="button button-primary" href={`/api/phaseone/events/${slug}/go/briefing`} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View briefing</a>
                  ) : (
                    <button className={`button ${styles.briefingDisabled}`} type="button" disabled>Briefing not started</button>
                  )}
                </div>
              </li>

              {volunteerEvent.whatsapp_url ? (
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">2</span>
                  <div className={styles.stepBody}>
                    <h3>Join the WhatsApp group</h3>
                    <p>Join the group for event-day announcements and instructions from the team.</p>
                    <a className="button button-secondary" href={volunteerEvent.whatsapp_url} target="_blank" rel="noopener noreferrer">Join WhatsApp group</a>
                  </div>
                </li>
              ) : null}

              {hasProgrammeRundown ? (
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">{programmeRundownStep}</span>
                  <div className={styles.stepBody}>
                    <h3>View the programme rundown</h3>
                    <p>Check the programme and key timings before you report for the event.</p>
                    {rundownImages.length > 0 ? (
                      <ProgrammeRundownGallery images={rundownImages} />
                    ) : volunteerEvent.programme_rundown_url ? (
                      <a className="button button-secondary" href={volunteerEvent.programme_rundown_url} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">View programme rundown</a>
                    ) : null}
                  </div>
                </li>
              ) : null}

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">{preparationStep}</span>
                <div className={styles.stepBody}>
                  <h3>Prepare for the event</h3>
                  <p className={styles.notes}>{volunteerEvent.attire_notes}</p>
                  {volunteerEvent.preparation_notes ? <p className={styles.notes}>{volunteerEvent.preparation_notes}</p> : null}
                </div>
              </li>

              <li className={styles.flowStep}>
                <span className={styles.stepNumber} aria-hidden="true">{travelStep}</span>
                <div className={styles.stepBody}>
                  <h3>Travel to the venue</h3>
                  <p>{volunteerEvent.navigation_destination}</p>
                  <div className={styles.stepActions}>
                    <a className="button button-secondary" href={directions.appleMaps} target="_blank" rel="noopener noreferrer">Apple Maps</a>
                    <a className="button button-secondary" href={directions.googleMaps} target="_blank" rel="noopener noreferrer">Google Maps</a>
                  </div>
                </div>
              </li>

              {signInState?.configured && signInStep ? (
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">{signInStep}</span>
                  <div className={styles.stepBody}>
                    <h3>Check in when you arrive</h3>
                    <p className="phaseone-access-note">The sign-in PIN will be provided by staff when you arrive on-site.</p>
                    {signInState.unlocked ? (
                      <>
                        <a className="button button-primary" href={`/api/phaseone/events/${slug}/go/sign-in`} referrerPolicy="no-referrer">Open sign-in</a>
                        <p className="phaseone-access-note">Access remains valid for five minutes or until this PIN changes.</p>
                      </>
                    ) : (
                      <PackageActionPinForm slug={slug} action="sign-in" />
                    )}
                  </div>
                </li>
              ) : null}

              {signOutState?.configured && signOutStep ? (
                <li className={styles.flowStep}>
                  <span className={styles.stepNumber} aria-hidden="true">{signOutStep}</span>
                  <div className={styles.stepBody}>
                    <h3>Check out before you leave</h3>
                    <p className="phaseone-access-note">Get the sign-out PIN from staff and complete check-out before leaving the venue.</p>
                    {signOutState.unlocked ? (
                      <>
                        <a className="button button-primary" href={`/api/phaseone/events/${slug}/go/sign-out`} referrerPolicy="no-referrer">Open sign-out</a>
                        <p className="phaseone-access-note">Access remains valid for five minutes or until this PIN changes.</p>
                      </>
                    ) : (
                      <PackageActionPinForm slug={slug} action="sign-out" />
                    )}
                  </div>
                </li>
              ) : null}
            </ol>
          </section>
        </article>
      </main>
    </div>
  );
}
