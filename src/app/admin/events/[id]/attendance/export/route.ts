import { NextRequest, NextResponse } from "next/server";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { csvCell } from "@/lib/security/csv";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function singaporeDate(value: string): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function shiftLabel(timeslot: { label: string | null; starts_at: string; ends_at: string | null }) {
  if (timeslot.label?.trim()) return timeslot.label.trim();
  const start = singaporeTime(timeslot.starts_at);
  const end = timeslot.ends_at ? singaporeTime(timeslot.ends_at) : null;
  return end ? `${start}-${end}` : start;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, timeslotsResult, rosterResult, attendanceResult] = await Promise.all([
    admin.from("phaseone_events").select("title, slug").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at")
      .eq("event_id", id),
    admin
      .from("phaseone_roster")
      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, tshirt_size")
      .eq("event_id", id)
      .order("volunteer_name"),
    admin
      .from("phaseone_attendance")
      .select("roster_id, signed_in_at, signed_out_at, updated_at")
      .eq("event_id", id),
  ]);

  if (
    eventResult.error ||
    !eventResult.data ||
    timeslotsResult.error ||
    !timeslotsResult.data ||
    rosterResult.error ||
    !rosterResult.data ||
    attendanceResult.error ||
    !attendanceResult.data
  ) {
    return NextResponse.json({ error: "Attendance export is unavailable." }, { status: 500 });
  }

  const timeslotById = new Map(timeslotsResult.data.map((timeslot) => [timeslot.id, timeslot]));
  const attendanceByRoster = new Map(attendanceResult.data.map((record) => [record.roster_id, record]));
  const rows = rosterResult.data.map((volunteer) => {
    const attendance = attendanceByRoster.get(volunteer.id);
    const timeslot = timeslotById.get(volunteer.timeslot_id);
    const status = attendance?.signed_out_at
      ? attendance.signed_in_at
        ? "checked_out"
        : "anomaly_check_out_without_check_in"
      : attendance?.signed_in_at
        ? "checked_in"
        : "not_arrived";
    return [
      timeslot ? singaporeDate(timeslot.starts_at) : null,
      timeslot ? shiftLabel(timeslot) : null,
      timeslot?.starts_at,
      timeslot?.ends_at,
      volunteer.volunteer_key,
      volunteer.volunteer_name,
      volunteer.mobile,
      volunteer.email,
      volunteer.tshirt_size,
      status,
      attendance?.signed_in_at,
      attendance?.signed_out_at,
      attendance?.updated_at,
    ].map(csvCell).join(",");
  });

  const header = [
    "date",
    "shift",
    "shift_starts_at",
    "shift_ends_at",
    "volunteer_id",
    "volunteer_name",
    "contact_number",
    "email",
    "tshirt_size",
    "attendance_status",
    "checked_in_at",
    "checked_out_at",
    "last_updated_at",
  ].map(csvCell).join(",");
  const csv = [header, ...rows].join("\r\n");
  const safeSlug = eventResult.data.slug.replace(/[^a-z0-9-]/g, "-");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeSlug}-attendance.csv"`,
      "cache-control": "no-store",
    },
  });
}
