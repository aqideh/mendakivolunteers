import { NextResponse } from "next/server";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

function csvCell(value: unknown): string {
  let text = String(value ?? "");
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replaceAll('"', '""')}"`;
}

function safeFilename(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "event";
}

type RouteProps = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/insights`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, insightsResult] = await Promise.all([
    admin.from("phaseone_events").select("title").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_volunteer_insights")
      .select("id, volunteer_person_key, category, value, detail, source_type, captured_at, phaseone_roster(volunteer_key, volunteer_name, email, mobile)")
      .eq("event_id", id)
      .eq("review_status", "accepted")
      .order("captured_at", { ascending: true })
      .limit(5000),
  ]);

  if (eventResult.error || !eventResult.data) {
    return NextResponse.json({ error: "Event could not be loaded." }, { status: 404 });
  }
  if (insightsResult.error || !insightsResult.data) {
    return NextResponse.json({ error: "Accepted insights could not be exported." }, { status: 500 });
  }

  const eventTitle = eventResult.data.title;
  const headers = [
    "Source Insight ID",
    "KELUARGA Person Key",
    "Volunteer ID",
    "Name",
    "Email",
    "Mobile",
    "Category",
    "Value",
    "Detail",
    "Source Type",
    "Source Event",
    "Captured At",
  ];

  const rows = insightsResult.data.map((insight) => {
    const roster = Array.isArray(insight.phaseone_roster) ? insight.phaseone_roster[0] : insight.phaseone_roster;
    return [
      insight.id,
      insight.volunteer_person_key,
      roster?.volunteer_key ?? "",
      roster?.volunteer_name ?? "",
      roster?.email ?? "",
      roster?.mobile ?? "",
      insight.category,
      insight.value,
      insight.detail ?? "",
      insight.source_type,
      eventTitle,
      insight.captured_at,
    ];
  });

  const csv = [headers, ...rows].map((row) => row.map(csvCell).join(",")).join("\r\n");
  const filename = `maklom-volunteer-insights-${safeFilename(eventTitle)}.csv`;

  return new NextResponse(`\uFEFF${csv}`, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
