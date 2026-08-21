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

function timeslotLabel(timeslot: { label: string | null; starts_at: string; ends_at: string | null }) {
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
  await requireEventManager(`/admin/events/${id}/edit`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, timeslotsResult] = await Promise.all([
    admin.from("phaseone_events").select("title, slug").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_event_timeslots")
      .select("id, label, starts_at, ends_at, status, sort_order")
      .eq("event_id", id)
      .neq("status", "cancelled")
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true }),
  ]);

  if (eventResult.error || !eventResult.data || timeslotsResult.error || !timeslotsResult.data) {
    return NextResponse.json({ error: "Roster template is unavailable." }, { status: 500 });
  }

  const header = [
    "volunteer_name",
    "contact_number",
    "email",
    "tshirt_size",
    "volunteer_id",
    "date",
    "shift",
    "timeslot_id",
  ].map(csvCell).join(",");

  const rows = timeslotsResult.data.map((timeslot) => [
    "",
    "",
    "",
    "",
    "",
    singaporeDate(timeslot.starts_at),
    timeslotLabel(timeslot),
    timeslot.id,
  ].map(csvCell).join(","));

  const csv = [header, ...rows].join("\r\n");
  const safeSlug = eventResult.data.slug.replace(/[^a-z0-9-]/g, "-");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="${safeSlug}-roster-template.csv"`,
      "cache-control": "no-store",
    },
  });
}
