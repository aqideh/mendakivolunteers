import { NextRequest, NextResponse } from "next/server";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function csvCell(value: string | null | undefined): string {
  const text = value ?? "";
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const { id } = await context.params;
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, rosterResult, attendanceResult] = await Promise.all([
    admin.from("phaseone_events").select("title, slug").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_roster")
      .select("id, volunteer_key, volunteer_name, email, mobile")
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
    rosterResult.error ||
    !rosterResult.data ||
    attendanceResult.error ||
    !attendanceResult.data
  ) {
    return NextResponse.json({ error: "Attendance export is unavailable." }, { status: 500 });
  }

  const attendanceByRoster = new Map(
    attendanceResult.data.map((record) => [record.roster_id, record]),
  );
  const rows = rosterResult.data.map((volunteer) => {
    const attendance = attendanceByRoster.get(volunteer.id);
    const status = attendance?.signed_out_at
      ? attendance.signed_in_at
        ? "signed_out"
        : "anomaly_sign_out_without_sign_in"
      : attendance?.signed_in_at
        ? "signed_in"
        : "pending";
    return [
      volunteer.volunteer_key,
      volunteer.volunteer_name,
      volunteer.email,
      volunteer.mobile,
      status,
      attendance?.signed_in_at,
      attendance?.signed_out_at,
      attendance?.updated_at,
    ].map(csvCell).join(",");
  });

  const header = [
    "volunteer_id",
    "volunteer_name",
    "email",
    "mobile",
    "attendance_status",
    "signed_in_at",
    "signed_out_at",
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
