import { NextRequest, NextResponse } from "next/server";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  createProgrammeRosterWorkbook,
  type ProgrammeRosterSheet,
  type ProgrammeRosterVolunteer,
} from "@/lib/phaseone/roster-workbook";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const preferredRegion = "sin1";

type Props = { params: Promise<{ id: string }> };

function singaporeDate(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function singaporeTime(value: string): string {
  return new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(new Date(value));
}

function safeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 72) || "programme";
}

function dietaryText(
  roster: { dietary_requirements: string | null },
  profile?: {
    dietary_requirements: string | null;
    food_allergies: string | null;
    no_known_food_allergies: boolean | null;
  },
): string | null {
  const restrictions = (roster.dietary_requirements || profile?.dietary_requirements || "").trim();
  const allergies = (profile?.food_allergies || "").trim();
  if (allergies && !restrictions.toLowerCase().includes(allergies.toLowerCase())) {
    return [restrictions, "Allergies: " + allergies].filter(Boolean).join("; ");
  }
  return restrictions || (allergies ? "Allergies: " + allergies : null);
}

export async function GET(_request: NextRequest, { params }: Props) {
  const { id } = await params;
  // This export includes DOB and other sensitive details. Assigned volunteer leaders
  // are intentionally excluded: they can operate attendance, not download private profiles.
  await requireEventManager(`/admin/events/${id}/attendance`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, shiftsResult, rosterResult, attendanceResult] = await Promise.all([
    admin.from("phaseone_events").select("title, slug, venue").eq("id", id).maybeSingle(),
    admin.from("phaseone_event_timeslots").select("id, label, starts_at, ends_at, sort_order, status")
      .eq("event_id", id).order("starts_at", { ascending: true }).order("sort_order", { ascending: true }).limit(500),
    admin.from("phaseone_roster")
      .select("id, timeslot_id, volunteer_id, volunteer_name, mobile, email, tshirt_size, dietary_requirements")
      .eq("event_id", id)
      .or("source_assignment_status.is.null,source_assignment_status.neq.invalidated_historical_shift_match")
      .order("volunteer_name", { ascending: true }).limit(10000),
    admin.from("phaseone_attendance_effective")
      .select("roster_id, non_attendance_status, signed_in_at, signed_out_at")
      .eq("event_id", id).limit(10000),
  ]);

  if (eventResult.error || !eventResult.data) {
    return NextResponse.json({ error: "Programme not found." }, { status: 404 });
  }
  if (shiftsResult.error || rosterResult.error || attendanceResult.error ||
    !shiftsResult.data || !rosterResult.data || !attendanceResult.data) {
    return NextResponse.json({ error: "The programme roster could not be loaded." }, { status: 500 });
  }
  // Do not silently truncate a confidential roster.
  if (shiftsResult.data.length === 500 || rosterResult.data.length === 10000 ||
    attendanceResult.data.length === 10000) {
    return NextResponse.json({ error: "The roster is too large to export safely." }, { status: 422 });
  }

  const ids = [...new Set(rosterResult.data.map((row) => row.volunteer_id).filter(
    (value): value is string => Boolean(value),
  ))];
  const profiles = new Map<string, {
    date_of_birth: string | null;
    tshirt_size: string | null;
    dietary_requirements: string | null;
    food_allergies: string | null;
    no_known_food_allergies: boolean | null;
  }>();
  for (let index = 0; index < ids.length; index += 250) {
    const batch = await admin.from("volunteer_private_details")
      .select("volunteer_id, date_of_birth, tshirt_size, dietary_requirements, food_allergies, no_known_food_allergies")
      .in("volunteer_id", ids.slice(index, index + 250));
    if (batch.error || !batch.data) {
      console.error("Unable to load private details for roster export", { eventId: id, code: batch.error?.code });
      return NextResponse.json({ error: "The programme roster could not be loaded." }, { status: 500 });
    }
    for (const record of batch.data) profiles.set(record.volunteer_id, record);
  }

  const attendance = new Map(attendanceResult.data.map((entry) => [entry.roster_id, entry]));
  const byShift = new Map<string, ProgrammeRosterVolunteer[]>();
  for (const volunteer of rosterResult.data) {
    const profile = volunteer.volunteer_id ? profiles.get(volunteer.volunteer_id) : undefined;
    const record = attendance.get(volunteer.id);
    const status = record?.non_attendance_status === "withdrawn" ? "Withdrawn"
      : record?.non_attendance_status === "absent" ? "Absent"
      : record?.signed_out_at ? "Checked out"
      : record?.signed_in_at ? "Checked in" : "Not arrived";
    const list = byShift.get(volunteer.timeslot_id) ?? [];
    list.push({
      name: volunteer.volunteer_name,
      contactNumber: volunteer.mobile,
      email: volunteer.email,
      dateOfBirth: profile?.date_of_birth ?? null,
      tshirtSize: volunteer.tshirt_size || profile?.tshirt_size || null,
      dietaryRestrictions: dietaryText(volunteer, profile),
      status,
    });
    byShift.set(volunteer.timeslot_id, list);
  }

  const shifts: ProgrammeRosterSheet[] = shiftsResult.data
    .filter((shift) => shift.status !== "cancelled" || (byShift.get(shift.id)?.length ?? 0) > 0)
    .map((shift) => ({
      label: shift.label?.trim() || "Shift",
      date: singaporeDate(shift.starts_at),
      time: singaporeTime(shift.starts_at) + (shift.ends_at ? "–" + singaporeTime(shift.ends_at) : ""),
      volunteers: byShift.get(shift.id) ?? [],
    }));

  // Preserve any orphaned assignments rather than quietly dropping volunteers.
  const knownShiftIds = new Set(shiftsResult.data.map((shift) => shift.id));
  for (const [shiftId, volunteers] of byShift) {
    if (!knownShiftIds.has(shiftId)) {
      shifts.push({ label: "Shift unavailable", date: "Unknown date", time: "—", volunteers });
    }
  }

  const generatedAt = new Intl.DateTimeFormat("en-SG", {
    timeZone: "Asia/Singapore", day: "2-digit", month: "short", year: "numeric",
    hour: "2-digit", minute: "2-digit", hourCycle: "h23",
  }).format(new Date());
  const workbook = createProgrammeRosterWorkbook({
    title: eventResult.data.title,
    venue: eventResult.data.venue,
    generatedAt,
    shifts,
  });

  return new NextResponse(new Uint8Array(workbook), {
    headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "content-disposition": `attachment; filename="${safeFileName(eventResult.data.slug || eventResult.data.title)}-roster.xlsx"`,
      "cache-control": "private, no-store, max-age=0",
      "x-content-type-options": "nosniff",
    },
  });
}
