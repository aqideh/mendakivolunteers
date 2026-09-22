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
  const registrationClosed = Boolean(
    event.registration_deadline &&
      new Date(event.registration_deadline).getTime() < Date.now(),
  );

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
  const descriptionParagraphs = (event.opportunity_description ?? "")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer opportunity" lite />
      <main className="page-frame narrow-frame">
        <Link className="back-link" href="/opportunities">
          ← All opportunities
        </Link>

        <article className="content-detail">
          <div className="content-card-meta">
            {event.opportunity_category ? (
              <span className="tag">{event.opportunity_category}</span>
            ) : null}
            <span className="tag tag-accent">KELUARGA registration</span>
          </div>
          <h1>{event.title}</h1>
          {event.opportunity_summary ? (
            <p className="lede">{event.opportunity_summary}</p>
          ) : null}

          <dl className="detail-list">
            <div>
              <dt>Venue</dt>
              <dd>{event.venue ?? "Details to be confirmed"}</dd>
            </div>
            <div>
              <dt>Registration deadline</dt>
              <dd>
                {event.registration_deadline
                  ? formatSingaporeDateTime(event.registration_deadline)
                  : "No deadline set"}
              </dd>
            </div>
            <div>
              <dt>Available shifts</dt>
              <dd>{timeslots.length}</dd>
            </div>
          </dl>

          {descriptionParagraphs.length > 0 ? (
            <div className="prose-block">
              {descriptionParagraphs.map((paragraph) => (
                <p key={paragraph}>{paragraph}</p>
              ))}
            </div>
          ) : null}

          {event.opportunity_eligibility ? (
            <section className="panel">
              <p className="eyebrow">Eligibility & requirements</p>
              <p>{event.opportunity_eligibility}</p>
            </section>
          ) : null}

          <section className="section panel" aria-labelledby="register-title">
            <p className="eyebrow">Registration</p>
            <h2 id="register-title">Register with KELUARGA</h2>

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
              <div className="notice" role="status">
                <strong>Status: {statusLabel(registration.status)}</strong>
                <p>
                  Submitted {formatSingaporeDateTime(registration.submitted_at)}.
                  {registration.review_note
                    ? ` Staff note: ${registration.review_note}`
                    : ""}
                </p>
              </div>
            ) : null}

            {!userId ? (
              <>
                <p>
                  Sign in or create a KELUARGA account with your email address. You
                  will return here to select your shift and submit your registration.
                </p>
                <Link
                  className="button button-primary"
                  href={`/login?next=${encodeURIComponent(`/opportunities/${slug}`)}`}
                >
                  Sign in or sign up to register
                </Link>
              </>
            ) : registrationClosed ? (
              <p className="empty-state">Registration is closed for this programme.</p>
            ) : editable ? (
              <form action={submitOpportunityRegistration} className="phaseone-admin-form">
                <input name="eventId" type="hidden" value={event.id} />
                <input name="slug" type="hidden" value={event.slug} />

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

                <fieldset className="phaseone-admin-fieldset">
                  <legend>Select shift(s)</legend>
                  <div className="record-list">
                    {timeslots.map((timeslot) => (
                      <label className="record-card checkbox-row" key={timeslot.id}>
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
                          <span className="table-subtext">
                            {formatTimeslotDate(timeslot.starts_at)} ·{" "}
                            {formatTimeslotTimeRange(timeslot)}
                            {timeslot.registration_capacity
                              ? ` · up to ${timeslot.registration_capacity} volunteers`
                              : ""}
                          </span>
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>

                <button className="button button-primary" type="submit">
                  {registration ? "Update registration" : "Submit registration"}
                </button>
              </form>
            ) : registration?.status === "confirmed" ? (
              <div className="actions">
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
        </article>
      </main>
    </div>
  );
}
