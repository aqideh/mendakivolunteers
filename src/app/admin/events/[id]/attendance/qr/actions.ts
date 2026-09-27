"use server";

import { z } from "zod";

import { requireAttendanceOperator } from "@/lib/auth/event-access";
import { createAttendanceQrSession } from "@/lib/phaseone/attendance-qr";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const schema = z.object({
  eventId: z.string().uuid(),
  timeslotId: z.string().uuid(),
  action: z.enum(["check_in", "check_out"]),
});

export type AttendanceQrResult =
  | { ok: true; url: string; expiresAt: string }
  | { ok: false; error: string };

export async function generateAttendanceQr(input: unknown): Promise<AttendanceQrResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "QR request could not be read." };

  const returnPath = `/admin/events/${parsed.data.eventId}/attendance/qr?timeslot=${encodeURIComponent(parsed.data.timeslotId)}&action=${encodeURIComponent(parsed.data.action)}`;
  const { userId } = await requireAttendanceOperator(returnPath);
  const admin = getPhaseOneAdminClient();
  const { data: timeslot, error } = await admin
    .from("phaseone_event_timeslots")
    .select("id")
    .eq("id", parsed.data.timeslotId)
    .eq("event_id", parsed.data.eventId)
    .neq("status", "cancelled")
    .maybeSingle();
  if (error || !timeslot) return { ok: false, error: "This shift is unavailable." };

  try {
    const result = await createAttendanceQrSession({ ...parsed.data, createdBy: userId });
    return { ok: true, ...result };
  } catch (cause) {
    console.error("Unable to generate attendance QR", { eventId: parsed.data.eventId, cause });
    return { ok: false, error: "Attendance QR could not be generated." };
  }
}
