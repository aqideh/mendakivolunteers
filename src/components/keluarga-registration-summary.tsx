import Link from "next/link";

import { withdrawRegistration } from "@/app/dashboard/registration-actions";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

function getServerNowMs(): number {
  return Date.now();
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
    case "withdrawn":
      return "Withdrawn";
    default:
      return status;
  }
}

export async function KeluargaRegistrationSummary({
  volunteerId,
}: {
  volunteerId: string;
}) {
  const admin = getPhaseOneAdminClient();
  const [registrationsResult, notificationsResult, rosterResult] = await Promise.all([
    admin
      .from("keluarga_registrations")
      .select("id, event_id, status, submitted_at, review_note")
      .eq("volunteer_id", volunteerId)
      .order("submitted_at", { ascending: false })
      .limit(50),
    admin
      .from("keluarga_notifications")
      .select("id, event_id, title, message, created_at")
      .eq("volunteer_id", volunteerId)
      .order("created_at", { ascending: false })
      .limit(5),
    admin
      .from("phaseone_roster")
      .select("id, event_id, timeslot_id, registration_id")
      .eq("volunteer_id", volunteerId)
        .or("source_assignment_status.is.null,source_assignment_status.neq.invalidated_historical_shift_match")
      .limit(100),
  ]);

  if (
    registrationsResult.error ||
    notificationsResult.error ||
    rosterResult.error
  ) {
    console.error("Unable to load KELUARGA activity summary", {
      registrationsCode: registrationsResult.error?.code,
      notificationsCode: notificationsResult.error?.code,
      rosterCode: rosterResult.error?.code,
      volunteerId,
    });
    return (
      <section className="section notice notice-error">
        Activity status is temporarily unavailable.
      </section>
    );
  }

  const registrations = registrationsResult.data ?? [];
  const rosterRows = rosterResult.data ?? [];
  const eventIds = Array.from(
    new Set([
      ...registrations.map(({ event_id }) => event_id),
      ...rosterRows.map(({ event_id }) => event_id),
      ...(notificationsResult.data ?? [])
        .map(({ event_id }) => event_id)
        .filter((id): id is string => Boolean(id)),
    ]),
  );
  const timeslotIds = Array.from(
    new Set(
      rosterRows
        .map(({ timeslot_id }) => timeslot_id)
        .filter((id): id is string => Boolean(id)),
    ),
  );

  const [eventsResult, timeslotsResult] = await Promise.all([
    eventIds.length
      ? admin
          .from("phaseone_events")
          .select("id, title, slug, venue, is_published")
          .in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    timeslotIds.length
      ? admin
          .from("phaseone_event_timeslots")
          .select("id, label, starts_at, ends_at, status")
          .in("id", timeslotIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsResult.error || timeslotsResult.error) {
    console.error("Unable to load activity programme details", {
      eventsCode: eventsResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
      volunteerId,
    });
  }

  const eventById = new Map(
    (eventsResult.data ?? []).map((event) => [event.id, event]),
  );
  const timeslotById = new Map(
    (timeslotsResult.data ?? []).map((timeslot) => [timeslot.id, timeslot]),
  );

  const now = getServerNowMs();
  const currentAssignments = rosterRows
    .map((roster) => {
      const event = eventById.get(roster.event_id);
      const timeslot = roster.timeslot_id
        ? timeslotById.get(roster.timeslot_id)
        : undefined;
      return { roster, event, timeslot };
    })
    .filter(({ timeslot }) => {
      if (!timeslot || timeslot.status === "cancelled") {
        return false;
      }
      const endsAt = timeslot.ends_at
        ? new Date(timeslot.ends_at).getTime()
        : new Date(timeslot.starts_at).getTime() + 12 * 60 * 60 * 1000;
      return endsAt >= now;
    })
    .sort(
      (a, b) =>
        new Date(a.timeslot?.starts_at ?? 0).getTime() -
        new Date(b.timeslot?.starts_at ?? 0).getTime(),
    );

  return (
    <>
      <section className="section" aria-labelledby="current-assignments-title">
        <p className="eyebrow">Current activity</p>
        <h2 id="current-assignments-title">Your upcoming assignments</h2>

        {currentAssignments.length === 0 ? (
          <div className="panel empty-state">
            <p>You do not have any upcoming roster assignments.</p>
            <Link className="text-link" href="/opportunities">
              Browse opportunities
            </Link>
          </div>
        ) : (
          <div className="record-list">
            {currentAssignments.map(({ roster, event, timeslot }) => (
              <article className="record-card" key={roster.id}>
                <div>
                  <p className="record-kicker">
                    {timeslot?.label ? `${timeslot.label} · ` : ""}
                    {timeslot
                      ? formatSingaporeDateTime(timeslot.starts_at)
                      : "Reporting time to be confirmed"}
                  </p>
                  <h3>{event?.title ?? "Volunteer programme"}</h3>
                  {event?.venue ? (
                    <p className="record-meta">{event.venue}</p>
                  ) : null}
                  {event?.is_published ? (
                    <div className="actions">
                      <Link className="text-link" href={`/journey/${event.slug}`}>
                        Event Guide
                      </Link>
                    </div>
                  ) : null}
                </div>
                <span className="status-pill" data-state="confirmed">
                  Assigned
                </span>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="section" aria-labelledby="keluarga-registrations-title">
        <p className="eyebrow">KELUARGA registrations</p>
        <h2 id="keluarga-registrations-title">Your programme registrations</h2>

        {registrations.length === 0 ? (
          <div className="panel empty-state">
            <p>You have not registered for a KELUARGA programme yet.</p>
            <Link className="text-link" href="/opportunities">
              Browse opportunities
            </Link>
          </div>
        ) : (
          <div className="record-list">
            {registrations.map((registration) => {
              const event = eventById.get(registration.event_id);
              return (
                <article className="record-card" key={registration.id}>
                  <div>
                    <p className="record-kicker">
                      Submitted {formatSingaporeDateTime(registration.submitted_at)}
                    </p>
                    <h3>{event?.title ?? "Volunteer programme"}</h3>
                    {registration.review_note ? (
                      <p className="record-meta">{registration.review_note}</p>
                    ) : null}
                    {["pending", "waitlisted", "confirmed"].includes(
                      registration.status,
                    ) ? (
                      <details className="phaseone-inline-disclosure">
                        <summary>Withdraw registration</summary>
                        <form action={withdrawRegistration} className="phaseone-admin-form">
                          <input
                            name="registrationId"
                            type="hidden"
                            value={registration.id}
                          />
                          <div className="form-field">
                            <label htmlFor={`withdraw-reason-${registration.id}`}>
                              Reason (optional)
                            </label>
                            <textarea
                              id={`withdraw-reason-${registration.id}`}
                              maxLength={1000}
                              name="reason"
                              rows={2}
                            />
                          </div>
                          <button className="button button-secondary" type="submit">
                            Confirm withdrawal
                          </button>
                        </form>
                      </details>
                    ) : null}
                    {event ? (
                      <div className="actions">
                        <Link
                          className="text-link"
                          href={`/opportunities/${event.slug}`}
                        >
                          View registration
                        </Link>
                        {registration.status === "confirmed" && event.is_published ? (
                          <Link className="text-link" href={`/journey/${event.slug}`}>
                            Event Guide
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                  <span className="status-pill" data-state={registration.status}>
                    {statusLabel(registration.status)}
                  </span>
                </article>
              );
            })}
          </div>
        )}

        {(notificationsResult.data ?? []).length > 0 ? (
          <div className="read-model-section">
            <h3>Recent updates</h3>
            <div className="record-list">
              {(notificationsResult.data ?? []).map((notification) => (
                <article className="record-card" key={notification.id}>
                  <div>
                    <h3>{notification.title}</h3>
                    <p>{notification.message}</p>
                    <p className="record-meta">
                      {formatSingaporeDateTime(notification.created_at)}
                    </p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>
    </>
  );
}
