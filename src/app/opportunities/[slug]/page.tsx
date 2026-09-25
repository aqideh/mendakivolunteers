import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
} from "@/lib/phaseone/packages";
import { createClient } from "@/lib/supabase/server";
import { submitOpportunityRegistration } from "./actions";

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export const dynamic = "force-dynamic";

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
): string | undefined {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function singaporeDateParts(value: string) {
  const parts = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).formatToParts(new Date(value));

  return {
    day: parts.find((part) => part.type === "day")?.value ?? "",
    month: parts.find((part) => part.type === "month")?.value ?? "",
    year: parts.find((part) => part.type === "year")?.value ?? "",
  };
}

function formatOpportunityDateRange(startsAt: string, endsAt: string | null) {
  const start = singaporeDateParts(startsAt);
  const end = singaporeDateParts(endsAt ?? startsAt);

  if (start.year === end.year && start.month === end.month && start.day === end.day) {
    return `${start.day} ${start.month} ${start.year}`;
  }
  if (start.year === end.year && start.month === end.month) {
    return `${start.day} – ${end.day} ${start.month} ${start.year}`;
  }
  if (start.year === end.year) {
    return `${start.day} ${start.month} – ${end.day} ${end.month} ${start.year}`;
  }
  return `${start.day} ${start.month} ${start.year} – ${end.day} ${end.month} ${end.year}`;
}

function statusLabel(status: string): string {
  switch (status) {
    case "pending":
      return "Pending review";
    case "confirmed":
      return "Confirmed";
    case "waitlisted":
      return "Waitlisted";
    case "rejected":
      return "Not confirmed";
    case "cancelled":
      return "Cancelled";
    default:
      return status;
  }
}

async function loadProgramme(slug: string) {
  const admin = getPhaseOneAdminClient();
  const eventResult = await admin
    .from("phaseone_events")
    .select(
      "id, title, slug, venue, navigation_destination, opportunity_summary, opportunity_description, opportunity_image_url, opportunity_category, opportunity_eligibility, registration_deadline, is_opportunity_published, is_published",
    )
    .eq("slug", slug)
    .eq("is_opportunity_published", true)
    .maybeSingle();

  if (eventResult.error) {
    console.error("Unable to load opportunity", { code: eventResult.error.code, slug });
    throw new Error("Opportunity details could not be loaded");
  }
  if (!eventResult.data) return null;

  const timeslotsResult = await admin
    .from("phaseone_event_timeslots")
    .select("id, label, starts_at, ends_at, status, sort_order, registration_capacity")
    .eq("event_id", eventResult.data.id)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true })
    .order("sort_order", { ascending: true });

  if (timeslotsResult.error || !timeslotsResult.data) {
    console.error("Unable to load opportunity shifts", {
      code: timeslotsResult.error?.code,
      eventId: eventResult.data.id,
    });
    throw new Error("Opportunity schedule could not be loaded");
  }

  return { event: eventResult.data, timeslots: timeslotsResult.data };
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const programme = await loadProgramme(slug);
  return programme
    ? {
        title: programme.event.title,
        description: programme.event.opportunity_summary ?? undefined,
      }
    : { title: "Opportunity not found" };
}

export default async function OpportunityPage({ params, searchParams }: PageProps) {
  const { slug } = await params;
  const programme = await loadProgramme(slug);
  if (!programme) notFound();

  const { event, timeslots } = programme;
  const parameters = await searchParams;
  const success = parameter(parameters, "success");
  const error = parameter(parameters, "error");
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub ?? null;

  let account: { display_name: string | null } | null = null;
  let volunteer: {
    id: string;
    volunteer_code: string;
    display_name: string | null;
    mobile: string | null;
  } | null = null;
  let registration: {
    id: string;
    status: string;
    review_note: string | null;
    submitted_at: string;
  } | null = null;
  let selectedIds = new Set<string>();

  if (userId) {
    const [accountResult, volunteerResult] = await Promise.all([
      supabase
        .schema("core")
        .from("user_accounts")
        .select("display_name")
        .eq("id", userId)
        .maybeSingle(),
      supabase
        .schema("core")
        .from("volunteers")
        .select("id, volunteer_code, display_name, mobile")
        .eq("auth_user_id", userId)
        .maybeSingle(),
    ]);

    account = accountResult.data;
    volunteer = volunteerResult.data;

    if (volunteer) {
      const admin = getPhaseOneAdminClient();
      const registrationResult = await admin
        .from("keluarga_registrations")
        .select("id, status, review_note, submitted_at")
        .eq("volunteer_id", volunteer.id)
        .eq("event_id", event.id)
        .maybeSingle();

      if (registrationResult.error) {
        console.error("Unable to load current KELUARGA registration", {
          code: registrationResult.error.code,
          eventId: event.id,
          userId,
        });
        throw new Error("Registration status could not be loaded");
      }
      registration = registrationResult.data;

      if (registration) {
        const selectedResult = await admin
          .from("keluarga_registration_shifts")
          .select("timeslot_id")
          .eq("registration_id", registration.id);
        if (selectedResult.error) {
          throw new Error("Registration shifts could not be loaded");
        }
        selectedIds = new Set(
          (selectedResult.data ?? []).map(({ timeslot_id }) => String(timeslot_id)),
        );
      }
    }
  }

  const editable = !registration || registration.status === "pending";
  const firstTimeslot = timeslots[0] ?? null;
  const lastTimeslot = timeslots.at(-1) ?? null;
  const opportunityDateRange =
    firstTimeslot && lastTimeslot
      ? formatOpportunityDateRange(
          firstTimeslot.starts_at,
          lastTimeslot.ends_at ?? lastTimeslot.starts_at,
        )
      : null;
  const descriptionParagraphs: string[] = (
    typeof event.opportunity_description === "string"
      ? event.opportunity_description
      : ""
  )
    .split(/\n{2,}/)
    .map((paragraph: string) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer opportunity" lite />
      <main className="page-frame narrow-frame">
        <Link className="back-link" href="/opportunities">
          ← All opportunities
        </Link>

        <article className="content-detail phaseone-opportunity-detail">
          <div
            className="phaseone-opportunity-detail-image"
            style={
              event.opportunity_image_url
                ? { backgroundImage: `url("${event.opportunity_image_url.replace(/"/g, "%22")}")` }
                : undefined
            }
            aria-hidden="true"
          >
            {!event.opportunity_image_url ? <span>MENDAKI</span> : null}
          </div>

          <div className="phaseone-opportunity-detail-content">
            <div className="phaseone-opportunity-pills" aria-label="Opportunity details">
              {event.opportunity_category ? (
                <span className="phaseone-opportunity-category">
                  {event.opportunity_category}
                </span>
              ) : null}
              {opportunityDateRange ? <span>{opportunityDateRange}</span> : null}
              <span>
                {timeslots.length} {timeslots.length === 1 ? "shift" : "shifts"}
              </span>
            </div>

            <h1>{event.title}</h1>
            {event.opportunity_summary ? (
              <p className="phaseone-opportunity-detail-summary">
                {event.opportunity_summary}
              </p>
            ) : null}

            <div className="phaseone-opportunity-facts">
              <div>
                <span>Venue</span>
                <strong>{event.venue ?? "Details to be confirmed"}</strong>
                {event.navigation_destination ? (
                  <small>{event.navigation_destination}</small>
                ) : null}
              </div>
              <div>
                <span>Registration closes</span>
                <strong>
                  {event.registration_deadline
                    ? formatSingaporeDateTime(event.registration_deadline)
                    : "No deadline set"}
                </strong>
              </div>
            </div>

            {descriptionParagraphs.length > 0 ? (
              <section className="phaseone-opportunity-copy" aria-labelledby="about-opportunity-title">
                <h2 id="about-opportunity-title">About this opportunity</h2>
                <div className="prose-block">
                  {descriptionParagraphs.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </div>
              </section>
            ) : null}

            {event.opportunity_eligibility ? (
              <section className="phaseone-opportunity-requirements" aria-labelledby="opportunity-requirements-title">
                <h2 id="opportunity-requirements-title">Eligibility &amp; requirements</h2>
                <p>{event.opportunity_eligibility}</p>
              </section>
            ) : null}

            <section
              className="phaseone-opportunity-registration"
              aria-labelledby="register-title"
            >
              <div className="phaseone-opportunity-registration-heading">
                <div>
                  <h2 id="register-title">
                    {registration ? "Your registration" : "Volunteer for this activity"}
                  </h2>
                  <p>
                    {registration
                      ? "Review your status or update your shift selection while registration is still pending."
                      : "Choose the shift or shifts that work for you."}
                  </p>
                </div>
                {registration ? (
                  <span className="status-pill" data-state={registration.status}>
                    {statusLabel(registration.status)}
                  </span>
                ) : null}
              </div>

              {success === "registration_submitted" ? (
                <div className="notice notice-success" role="status">
                  Registration submitted. Volunteer Management will review it in KELUARGA.
                </div>
              ) : null}
              {error ? (
                <div className="notice notice-error" role="alert">
                  {error}
                </div>
              ) : null}

              {registration ? (
                <p className="phaseone-opportunity-registration-meta">
                  Submitted {formatSingaporeDateTime(registration.submitted_at)}.
                  {registration.review_note
                    ? ` Staff note: ${registration.review_note}`
                    : ""}
                </p>
              ) : null}

              {!userId ? (
                <div className="phaseone-opportunity-signin">
                  <p>
                    Sign in or create a KELUARGA account to select your shift and
                    register.
                  </p>
                  <Link
                    className="button button-primary"
                    href={`/login?next=${encodeURIComponent(`/opportunities/${slug}`)}`}
                  >
                    Sign in or sign up
                  </Link>
                </div>
              ) : editable ? (
                <form
                  action={submitOpportunityRegistration}
                  className="phaseone-admin-form phaseone-opportunity-registration-form"
                >
                  <input name="eventId" type="hidden" value={event.id} />
                  <input name="slug" type="hidden" value={event.slug} />

                  <div className="phaseone-opportunity-contact-grid">
                    <div className="form-field">
                      <label htmlFor="displayName">Full name</label>
                      <input
                        defaultValue={
                          volunteer?.display_name ?? account?.display_name ?? ""
                        }
                        id="displayName"
                        maxLength={120}
                        name="displayName"
                        required
                      />
                    </div>
                    <div className="form-field">
                      <label htmlFor="mobile">Mobile number</label>
                      <input
                        defaultValue={volunteer?.mobile ?? ""}
                        id="mobile"
                        inputMode="tel"
                        maxLength={40}
                        name="mobile"
                      />
                    </div>
                  </div>

                  <fieldset className="phaseone-opportunity-shifts">
                    <legend>Select shift(s)</legend>
                    <div className="phaseone-opportunity-shift-grid">
                      {timeslots.map((timeslot) => (
                        <label className="phaseone-opportunity-shift" key={timeslot.id}>
                          <input
                            defaultChecked={selectedIds.has(timeslot.id)}
                            name="timeslotId"
                            type="checkbox"
                            value={timeslot.id}
                          />
                          <span>
                            <strong>
                              {timeslot.label?.trim() ||
                                formatTimeslotDate(timeslot.starts_at)}
                            </strong>
                            <small>
                              {formatTimeslotDate(timeslot.starts_at)} ·{" "}
                              {formatTimeslotTimeRange(timeslot)}
                            </small>
                            {timeslot.registration_capacity ? (
                              <small>
                                Up to {timeslot.registration_capacity} volunteers
                              </small>
                            ) : null}
                          </span>
                        </label>
                      ))}
                    </div>
                  </fieldset>

                  <div className="phaseone-opportunity-registration-action">
                    <button className="button button-primary" type="submit">
                      {registration ? "Update registration" : "Submit registration"}
                    </button>
                  </div>
                </form>
              ) : registration?.status === "confirmed" ? (
                <div className="phaseone-opportunity-confirmed-action">
                  {event.is_published ? (
                    <Link
                      className="button button-primary"
                      href={`/journey/${event.slug}`}
                    >
                      Open Event Guide
                    </Link>
                  ) : (
                    <p className="muted">
                      Your Event Guide will appear when it is published.
                    </p>
                  )}
                </div>
              ) : (
                <p className="muted">
                  This registration has been reviewed. Changes now need to be handled
                  by Volunteer Management.
                </p>
              )}
            </section>

            <div className="phaseone-opportunity-consent-note">
              <p>
                By volunteering for this activity, you consent to the sharing of your
                personal information with MENDAKI and agree to be registered as a
                MENDAKI volunteer. MENDAKI may contact you with updates on future
                volunteer opportunities.
              </p>
              <p>
                Please also note that photos, videos, and/or interviews may be captured
                during events and used by Yayasan MENDAKI and/or the organiser for
                marketing and publicity purposes. Volunteers will be notified in advance
                should there be any changes to the programme.
              </p>
            </div>
          </div>
        </article>
      </main>
    </div>
  );
}
