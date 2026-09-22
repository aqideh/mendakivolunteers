import Link from "next/link";

import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

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

export async function KeluargaRegistrationSummary({
  volunteerId,
}: {
  volunteerId: string;
}) {
  const admin = getPhaseOneAdminClient();
  const [registrationsResult, notificationsResult] = await Promise.all([
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
  ]);

  if (registrationsResult.error || notificationsResult.error) {
    console.error("Unable to load KELUARGA registration summary", {
      registrationsCode: registrationsResult.error?.code,
      notificationsCode: notificationsResult.error?.code,
      volunteerId,
    });
    return (
      <section className="section notice notice-error">
        Registration status is temporarily unavailable.
      </section>
    );
  }

  const registrations = registrationsResult.data ?? [];
  const eventIds = Array.from(
    new Set([
      ...registrations.map(({ event_id }) => event_id),
      ...(notificationsResult.data ?? [])
        .map(({ event_id }) => event_id)
        .filter((id): id is string => Boolean(id)),
    ]),
  );
  const eventsResult = eventIds.length
    ? await admin
        .from("phaseone_events")
        .select("id, title, slug, is_published")
        .in("id", eventIds)
    : { data: [], error: null };

  if (eventsResult.error) {
    console.error("Unable to load registration programme titles", {
      code: eventsResult.error.code,
      volunteerId,
    });
  }

  const eventById = new Map(
    (eventsResult.data ?? []).map((event) => [event.id, event]),
  );

  return (
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
  );
}
