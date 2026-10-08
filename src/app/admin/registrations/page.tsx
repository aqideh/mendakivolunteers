import type { Metadata } from "next";
import Link from "next/link";

import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  formatTimeslotDate,
  formatTimeslotTimeRange,
} from "@/lib/phaseone/packages";
import {
  RegistrationReviewWorkspace,
  type RegistrationCapacityItem,
  type RegistrationReviewRow,
  type RegistrationSignal,
} from "./registration-review-workspace";

export const metadata: Metadata = { title: "Volunteer registrations" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function statusLabel(status: string) {
  if (status === "pending") return "Pending";
  if (status === "confirmed") return "Confirmed";
  if (status === "waitlisted") return "Waitlisted";
  if (status === "rejected") return "Not confirmed";
  if (status === "withdrawn") return "Withdrawn";
  return "Cancelled";
}

function overlaps(
  leftStart: string,
  leftEnd: string | null,
  rightStart: string,
  rightEnd: string | null,
) {
  const leftStartMs = new Date(leftStart).getTime();
  const leftEndMs = new Date(leftEnd ?? leftStart).getTime();
  const rightStartMs = new Date(rightStart).getTime();
  const rightEndMs = new Date(rightEnd ?? rightStart).getTime();
  return leftStartMs < rightEndMs && rightStartMs < leftEndMs;
}

export default async function RegistrationsAdminPage({ searchParams }: PageProps) {
  await requireEventManager("/admin/registrations");
  const parameters = await searchParams;
  const eventFilter = parameter(parameters, "event");
  const error = parameter(parameters, "error");
  const success = parameter(parameters, "success");
  const admin = getPhaseOneAdminClient();

  let registrationsQuery = admin
    .from("keluarga_registrations")
    .select("id, volunteer_id, auth_user_id, event_id, status, submitted_at, reviewed_at, review_note, identity_state")
    .order("submitted_at", { ascending: true })
    .limit(2000);

  if (eventFilter) registrationsQuery = registrationsQuery.eq("event_id", eventFilter);

  const registrationsResult = await registrationsQuery;
  if (registrationsResult.error || !registrationsResult.data) {
    throw new Error("Volunteer registrations could not be loaded");
  }

  const registrations = registrationsResult.data;
  const eventIds = Array.from(new Set(registrations.map((item) => item.event_id)));
  const volunteerIds = Array.from(new Set(registrations.map((item) => item.volunteer_id).filter((id): id is string => Boolean(id))));
  const authUserIds = Array.from(new Set(registrations.map((item) => item.auth_user_id).filter((id): id is string => Boolean(id))));
  const registrationIds = registrations.map((item) => item.id);

  const [eventsResult, volunteersResult, accountsResult, selectionsResult] = await Promise.all([
    eventIds.length
      ? admin.from("phaseone_events").select("id, title, slug").in("id", eventIds)
      : Promise.resolve({ data: [], error: null }),
    volunteerIds.length
      ? admin.schema("core").from("volunteers").select("id, volunteer_code, display_name, primary_email_normalized, mobile").in("id", volunteerIds)
      : Promise.resolve({ data: [], error: null }),
    authUserIds.length
      ? admin.schema("core").from("user_accounts").select("id, display_name, claimed_email_normalized, email_ownership_verified").in("id", authUserIds)
      : Promise.resolve({ data: [], error: null }),
    registrationIds.length
      ? admin.from("keluarga_registration_shifts").select("registration_id, timeslot_id").in("registration_id", registrationIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (eventsResult.error || volunteersResult.error || accountsResult.error || selectionsResult.error) {
    throw new Error("Registration review data could not be loaded");
  }

  const selections = selectionsResult.data ?? [];
  const timeslotIds = Array.from(new Set(selections.map((item) => item.timeslot_id)));

  const [timeslotsResult, allReservationsResult] = await Promise.all([
    timeslotIds.length
      ? admin.from("phaseone_event_timeslots")
          .select("id, event_id, label, starts_at, ends_at, status, sort_order, registration_capacity")
          .in("id", timeslotIds)
      : Promise.resolve({ data: [], error: null }),
    timeslotIds.length
      ? admin.from("keluarga_registration_shifts")
          .select("timeslot_id, registration:keluarga_registrations!inner(id, status)")
          .in("timeslot_id", timeslotIds)
          .in("registration.status", ["pending", "confirmed"])
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (timeslotsResult.error || allReservationsResult.error) {
    throw new Error("Registration shifts could not be loaded");
  }

  const eventById = new Map((eventsResult.data ?? []).map((event) => [event.id, event]));
  const volunteerById = new Map((volunteersResult.data ?? []).map((volunteer) => [volunteer.id, volunteer]));
  const accountById = new Map((accountsResult.data ?? []).map((account) => [account.id, account]));
  const timeslotById = new Map((timeslotsResult.data ?? []).map((timeslot) => [timeslot.id, timeslot]));

  const shiftIdsByRegistration = new Map<string, string[]>();
  for (const selection of selections) {
    const current = shiftIdsByRegistration.get(selection.registration_id) ?? [];
    current.push(selection.timeslot_id);
    shiftIdsByRegistration.set(selection.registration_id, current);
  }

  const reservedByTimeslot = new Map<string, { reserved: number; pending: number; confirmed: number }>();
  for (const item of allReservationsResult.data ?? []) {
    const registration = Array.isArray(item.registration) ? item.registration[0] : item.registration;
    if (!registration) continue;
    const current = reservedByTimeslot.get(item.timeslot_id) ?? { reserved: 0, pending: 0, confirmed: 0 };
    current.reserved += 1;
    if (registration.status === "pending") current.pending += 1;
    if (registration.status === "confirmed") current.confirmed += 1;
    reservedByTimeslot.set(item.timeslot_id, current);
  }

  const activeByVolunteer = new Map<string, typeof registrations>();
  for (const registration of registrations) {
    if (!registration.volunteer_id || !["pending", "waitlisted", "confirmed"].includes(registration.status)) continue;
    const current = activeByVolunteer.get(registration.volunteer_id) ?? [];
    current.push(registration);
    activeByVolunteer.set(registration.volunteer_id, current);
  }

  const rows: RegistrationReviewRow[] = registrations.map((registration) => {
    const event = eventById.get(registration.event_id);
    const volunteer = registration.volunteer_id ? volunteerById.get(registration.volunteer_id) : undefined;
    const account = registration.auth_user_id ? accountById.get(registration.auth_user_id) : undefined;
    const identityResolved = registration.identity_state === "resolved" && Boolean(registration.volunteer_id);

    const shifts = (shiftIdsByRegistration.get(registration.id) ?? [])
      .map((id) => timeslotById.get(id))
      .filter((item): item is NonNullable<typeof item> => Boolean(item))
      .sort((left, right) => left.starts_at.localeCompare(right.starts_at) || left.sort_order - right.sort_order);

    const shiftViews = shifts.map((shift) => {
      const reservation = reservedByTimeslot.get(shift.id) ?? { reserved: 0, pending: 0, confirmed: 0 };
      const capacity = shift.registration_capacity;
      return {
        id: shift.id,
        label: shift.label?.trim() || formatTimeslotDate(shift.starts_at),
        dateLabel: formatTimeslotDate(shift.starts_at),
        timeLabel: formatTimeslotTimeRange(shift),
        capacity,
        reserved: reservation.reserved,
        left: capacity === null ? null : Math.max(0, capacity - reservation.reserved),
      };
    });

    const signals: RegistrationSignal[] = [];
    if (!identityResolved) signals.push({ key: "identity", label: "Identity review", tone: "warning" });
    if (!volunteer?.mobile) signals.push({ key: "mobile", label: "Missing phone", tone: "warning" });

    const otherActive = registration.volunteer_id
      ? (activeByVolunteer.get(registration.volunteer_id) ?? []).filter((item) => item.id !== registration.id)
      : [];

    if (otherActive.length > 0) {
      signals.push({ key: "duplicate", label: String(otherActive.length + 1) + " programmes", tone: "info" });
    }

    const hasClash = otherActive.some((other) => {
      const otherShifts = (shiftIdsByRegistration.get(other.id) ?? [])
        .map((id) => timeslotById.get(id))
        .filter((item): item is NonNullable<typeof item> => Boolean(item));
      return shifts.some((left) =>
        otherShifts.some((right) => overlaps(left.starts_at, left.ends_at, right.starts_at, right.ends_at)),
      );
    });

    if (hasClash) signals.push({ key: "clash", label: "Schedule clash", tone: "danger" });

    const tightShift = shiftViews.find((shift) => shift.capacity !== null && shift.left !== null && shift.left <= 3);
    if (tightShift) {
      signals.push({
        key: "capacity",
        label: tightShift.left === 0 ? "Capacity full" : String(tightShift.left) + " left",
        tone: tightShift.left === 0 ? "danger" : "warning",
      });
    }

    const capacitySummary = shiftViews.length
      ? shiftViews.map((shift) =>
          shift.capacity === null
            ? shift.label + ": no cap"
            : shift.label + ": " + (shift.left === 0 ? "full" : String(shift.left) + " left"),
        ).join(" · ")
      : "No shifts";

    return {
      id: registration.id,
      eventId: registration.event_id,
      eventTitle: event?.title ?? registration.event_id,
      status: registration.status,
      statusLabel: statusLabel(registration.status),
      submittedLabel: formatSingaporeDateTime(registration.submitted_at),
      submittedAt: registration.submitted_at,
      reviewedLabel: registration.reviewed_at ? formatSingaporeDateTime(registration.reviewed_at) : null,
      volunteerName: volunteer?.display_name ?? account?.display_name ?? "Volunteer",
      volunteerCode: volunteer?.volunteer_code ?? null,
      email: volunteer?.primary_email_normalized ?? account?.claimed_email_normalized ?? null,
      mobile: volunteer?.mobile ?? null,
      identityResolved,
      identityReviewHref: identityResolved ? null : "/admin/reconciliation",
      shifts: shiftViews,
      shiftSummary: shiftViews.length
        ? shiftViews.map((shift) => shift.label + " · " + shift.dateLabel + " · " + shift.timeLabel).join(" | ")
        : "No shifts",
      capacitySummary,
      signals,
      reviewNote: registration.review_note,
      canReview: registration.status === "pending" || registration.status === "waitlisted",
      canCancel: ["pending", "waitlisted", "confirmed"].includes(registration.status),
      programmeHref: event ? "/admin/events/" + event.id + "/edit" : null,
      eventOpsHref: event && registration.status === "confirmed" ? "/admin/events/" + event.id + "/attendance" : null,
    };
  });

  const capacityItems: RegistrationCapacityItem[] = (timeslotsResult.data ?? [])
    .filter((timeslot) => timeslot.registration_capacity !== null)
    .map((timeslot) => {
      const reservation = reservedByTimeslot.get(timeslot.id) ?? { reserved: 0, pending: 0, confirmed: 0 };
      const capacity = timeslot.registration_capacity ?? 0;
      const event = eventById.get(timeslot.event_id);
      return {
        id: timeslot.id,
        eventTitle: event?.title ?? timeslot.event_id,
        label: timeslot.label?.trim() || formatTimeslotDate(timeslot.starts_at),
        dateLabel: formatTimeslotDate(timeslot.starts_at),
        timeLabel: formatTimeslotTimeRange(timeslot),
        capacity,
        reserved: reservation.reserved,
        pending: reservation.pending,
        confirmed: reservation.confirmed,
        left: Math.max(0, capacity - reservation.reserved),
      };
    })
    .sort((left, right) => left.left - right.left || left.eventTitle.localeCompare(right.eventTitle))
    .slice(0, 6);

  return (
    <div className="admin-page site-shell">
      <div className="admin-page-frame page-frame">
        <div className="dashboard-header registration-review-header">
          <div>
            <h1>Registration review</h1>
            <p className="muted">
              Review applications, monitor reserved capacity, and move confirmed volunteers into Event Operations.
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

        {success ? <div className="notice notice-success" role="status">Registration updated.</div> : null}
        {error ? <div className="notice notice-error" role="alert">{error}</div> : null}

        <RegistrationReviewWorkspace
          capacityItems={capacityItems}
          eventFilter={eventFilter}
          rows={rows}
        />
      </div>
    </div>
  );
}
