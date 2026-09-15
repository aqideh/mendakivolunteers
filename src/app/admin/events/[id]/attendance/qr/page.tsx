import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { AttendanceQrPresenter } from "@/components/phaseone/attendance-qr-presenter";
import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Attendance QR" };

type Props = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function param(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function label(slot: { label: string | null; starts_at: string; ends_at: string | null }) {
  if (slot.label?.trim()) return slot.label;
  const time = (value: string) => new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
  return slot.ends_at ? `${time(slot.starts_at)}–${time(slot.ends_at)}` : time(slot.starts_at);
}

export default async function AttendanceQrPage({ params, searchParams }: Props) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/attendance/qr`);
  const query = await searchParams;
  const requestedTimeslot = param(query.timeslot);
  const action = param(query.action) === "check_out" ? "check_out" : "check_in";
  const admin = getPhaseOneAdminClient();

  const [eventResult, slotsResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, venue").eq("id", id).maybeSingle(),
    admin.from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at, status")
      .eq("event_id", id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true }),
  ]);
  if (eventResult.error || slotsResult.error) throw new Error("Attendance QR data could not be loaded");
  if (!eventResult.data) notFound();
  const slots = slotsResult.data ?? [];
  const selected = slots.find((slot) => slot.id === requestedTimeslot) ?? slots[0];
  if (!selected) notFound();

  return (
    <div className="site-shell attendance-qr-shell">
      <PortalHeader status="Attendance QR" dashboard />
      <main className="page-frame attendance-qr-staff-page">
        <div className="attendance-qr-topbar">
          <Link className="text-link" href={`/admin/events/${id}/attendance?timeslot=${encodeURIComponent(selected.id)}`}>← Back to roster</Link>
          <div className="actions">
            <Link className={action === "check_in" ? "button button-primary" : "button button-secondary"} href={`/admin/events/${id}/attendance/qr?timeslot=${encodeURIComponent(selected.id)}&action=check_in`}>Check-in QR</Link>
            <Link className={action === "check_out" ? "button button-primary" : "button button-secondary"} href={`/admin/events/${id}/attendance/qr?timeslot=${encodeURIComponent(selected.id)}&action=check_out`}>Check-out QR</Link>
          </div>
        </div>

        <section className="attendance-qr-stage">
          <p className="eyebrow">{label(selected)}</p>
          <h1>{action === "check_in" ? "CHECK IN" : "CHECK OUT"}</h1>
          <h2>{eventResult.data.title}</h2>
          <p className="muted">{eventResult.data.venue ?? "Venue not set"}</p>
          <AttendanceQrPresenter action={action} eventId={id} timeslotId={selected.id} />
          <p className="attendance-qr-instruction">Volunteers: scan using your phone camera, identify yourself, then confirm attendance.</p>
        </section>

        {slots.length > 1 ? (
          <nav className="attendance-qr-shifts" aria-label="Choose shift">
            {slots.map((slot) => (
              <Link
                className={slot.id === selected.id ? "button button-primary" : "button button-secondary"}
                href={`/admin/events/${id}/attendance/qr?timeslot=${encodeURIComponent(slot.id)}&action=${action}`}
                key={slot.id}
              >
                {label(slot)}
              </Link>
            ))}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
