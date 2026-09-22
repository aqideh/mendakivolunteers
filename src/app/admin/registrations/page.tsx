import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
} from "@/lib/phaseone/packages";
import { reviewRegistration } from "./actions";

export const metadata: Metadata = { title: "Volunteer registrations" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: string) {
  return status === "pending"
    ? "Pending"
    : status === "confirmed"
      ? "Confirmed"
      : status === "waitlisted"
        ? "Waitlisted"
        : status === "rejected"
          ? "Not confirmed"
          : "Cancelled";
}

export default async function RegistrationsAdminPage({
  searchParams,
}: PageProps) {
  await requireEventManager("/admin/registrations");
  const parameters = await searchParams;
  const eventFilter = parameter(parameters, "event");
  const error = parameter(parameters, "error");
  const success = parameter(parameters, "success");
  const admin = getPhaseOneAdminClient();

  let registrationsQuery = admin
    .from("keluarga_registrations")
    .select(
      "id, volunteer_id, event_id, status, submitted_at, reviewed_at, review_note",
    )
    .order("submitted_at", { ascending: true })
    .limit(2000);
  if (eventFilter) {
    registrationsQuery = registrationsQuery.eq("event_id", eventFilter);
  }

  const registrationsResult = await registrationsQuery;
  if (registrationsResult.error || !registrationsResult.data) {
    throw new Error("Volunteer registrations could not be loaded");
  }

  const registrations = registrationsResult.data;
  const eventIds = Array.from(new Set(registrations.map(({ event_id }) => event_id)));
  const volunteerIds = Array.from(
    new Set(registrations.map(({ volunteer_id }) => volunteer_id)),
  );
  const registrationIds = registrations.map(({ id }) => id);

  const [eventsResult, volunteersResult, selectionsResult] = await Promise.all([
    eventIds.length
      ? admin.from("phaseone_events").select("id, title, slug").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    volunteerIds.length
      ? admin
          .schema("core")
          .from("volunteers")
          .select(
            "id, volunteer_code, display_name, primary_email_normalized, mobile",
          )
          .in("id", volunteerIds)
      : Promise.resolve({ data: [], error: null }),
    registrationIds.length
      ? admin
          .from("keluarga_registration_shifts")
          .select("registration_id, timeslot_id")
          .in("registration_id", registrationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsResult.error || volunteersResult.error || selectionsResult.error) {
    throw new Error("Registration review data could not be loaded");
  }

  const selections = selectionsResult.data ?? [];
  const timeslotIds = Array.from(
    new Set(selections.map(({ timeslot_id }) => timeslot_id)),
  );
  const timeslotsResult = timeslotIds.length
    ? await admin
        .from("phaseone_event_timeslots")
        .select("id, label, starts_at, ends_at, registration_capacity")
        .in("id", timeslotIds)
    : { data: [], error: null };

  if (timeslotsResult.error) {
    throw new Error("Registration shifts could not be loaded");
  }

  const eventById = new Map(
    (eventsResult.data ?? []).map((event) => [event.id, event]),
  );
  const volunteerById = new Map(
    (volunteersResult.data ?? []).map((volunteer) => [volunteer.id, volunteer]),
  );
  const timeslotById = new Map(
    (timeslotsResult.data ?? []).map((timeslot) => [timeslot.id, timeslot]),
  );
  const shiftIdsByRegistration = new Map<string, string[]>();
  for (const selection of selections) {
    const current = shiftIdsByRegistration.get(selection.registration_id) ?? [];
    current.push(selection.timeslot_id);
    shiftIdsByRegistration.set(selection.registration_id, current);
  }

  const sorted = [...registrations].sort((left, right) => {
    const rank = (status: string) =>
      status === "pending" ? 0 : status === "waitlisted" ? 1 : 2;
    return (
      rank(left.status) - rank(right.status) ||
      left.submitted_at.localeCompare(right.submitted_at)
    );
  });

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer registrations" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Community volunteer workflow</p>
            <h1>Registration review</h1>
            <p className="muted">
              Confirmed registrations flow directly into Event Operations. Capacity
              is checked transactionally when you confirm a volunteer.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/events">
              Programmes & events
            </Link>
            {eventFilter ? (
              <Link className="button button-secondary" href="/admin/registrations">
                All registrations
              </Link>
            ) : null}
          </div>
        </div>

        {success ? (
          <div className="notice notice-success" role="status">
            Registration updated.
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <section className="record-list" aria-label="Volunteer registrations">
          {sorted.map((registration) => {
            const event = eventById.get(registration.event_id);
            const volunteer = volunteerById.get(registration.volunteer_id);
            const shifts = (shiftIdsByRegistration.get(registration.id) ?? [])
              .map((id) => timeslotById.get(id))
              .filter((item): item is NonNullable<typeof item> => Boolean(item));
            const canReview =
              registration.status === "pending" ||
              registration.status === "waitlisted";

            return (
              <article className="panel" key={registration.id}>
                <div className="section-header">
                  <div>
                    <p className="eyebrow">
                      {volunteer?.volunteer_code ?? "KEL volunteer"}
                    </p>
                    <h2>{volunteer?.display_name ?? "Volunteer"}</h2>
                    <p className="muted">
                      {volunteer?.primary_email_normalized ?? "No email"} ·{" "}
                      {volunteer?.mobile ?? "No mobile"}
                    </p>
                  </div>
                  <span className="status-pill" data-state={registration.status}>
                    {statusLabel(registration.status)}
                  </span>
                </div>

                <dl className="data-list">
                  <div className="data-row">
                    <dt>Programme</dt>
                    <dd>{event?.title ?? registration.event_id}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Submitted</dt>
                    <dd>{formatSingaporeDateTime(registration.submitted_at)}</dd>
                  </div>
                  <div className="data-row">
                    <dt>Selected shifts</dt>
                    <dd>
                      {shifts.length
                        ? shifts
                            .map(
                              (shift) =>
                                `${shift.label?.trim() || formatTimeslotDate(shift.starts_at)} · ${formatTimeslotTimeRange(shift)}`,
                            )
                            .join(" | ")
                        : "No shifts"}
                    </dd>
                  </div>
                  {registration.review_note ? (
                    <div className="data-row">
                      <dt>Staff note</dt>
                      <dd>{registration.review_note}</dd>
                    </div>
                  ) : null}
                </dl>

                {canReview ? (
                  <form action={reviewRegistration} className="phaseone-admin-form">
                    <input
                      name="registrationId"
                      type="hidden"
                      value={registration.id}
                    />
                    <input
                      name="eventId"
                      type="hidden"
                      value={registration.event_id}
                    />
                    <div className="form-field">
                      <label htmlFor={`note-${registration.id}`}>
                        Staff note (optional)
                      </label>
                      <input
                        id={`note-${registration.id}`}
                        maxLength={1000}
                        name="note"
                      />
                    </div>
                    <div className="actions">
                      <button
                        className="button button-primary"
                        name="decision"
                        type="submit"
                        value="confirmed"
                      >
                        Confirm
                      </button>
                      <button
                        className="button button-secondary"
                        name="decision"
                        type="submit"
                        value="waitlisted"
                      >
                        Waitlist
                      </button>
                      <button
                        className="button"
                        name="decision"
                        type="submit"
                        value="rejected"
                      >
                        Reject
                      </button>
                    </div>
                  </form>
                ) : null}

                {event ? (
                  <div className="actions">
                    <Link
                      className="text-link"
                      href={`/admin/events/${event.id}/edit`}
                    >
                      Open programme
                    </Link>
                    {registration.status === "confirmed" ? (
                      <Link
                        className="text-link"
                        href={`/admin/events/${event.id}/attendance`}
                      >
                        Open Event Operations
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
          {sorted.length === 0 ? (
            <div className="panel empty-state">
              No registrations match this view.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
