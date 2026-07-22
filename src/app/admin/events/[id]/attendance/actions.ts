"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const attendanceActionSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  action: z.enum(["mark_sign_in", "mark_sign_out", "clear_sign_in", "clear_sign_out"]),
  timestamp: z.preprocess(
    (value) => {
      if (typeof value !== "string" || !value.trim()) return null;
      const date = new Date(value);
      return Number.isNaN(date.getTime()) ? value : date.toISOString();
    },
    z.string().datetime().nullable(),
  ),
  reason: z.string().trim().min(5).max(500),
});

function encode(value: string): string {
  return encodeURIComponent(value);
}

export async function applyAttendanceChange(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = attendanceActionSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    action: formData.get("action"),
    timestamp: formData.get("timestamp"),
    reason: formData.get("reason"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the attendance correction.";
    redirect(`/admin/events/${eventId}/attendance?error=${encode(message)}`);
  }

  const { userId } = await requireEventManager(`/admin/events/${eventId}/attendance`);
  const admin = getPhaseOneAdminClient();
  const { error } = await admin.rpc("phaseone_apply_attendance_change", {
    p_event_id: parsed.data.eventId,
    p_roster_id: parsed.data.rosterId,
    p_action: parsed.data.action,
    p_timestamp: parsed.data.timestamp,
    p_reason: parsed.data.reason,
    p_changed_by: userId,
  });

  if (error) {
    console.error("Unable to update phase-one attendance", {
      code: error.code,
      eventId,
      rosterId: parsed.data.rosterId,
      action: parsed.data.action,
    });
    redirect(
      `/admin/events/${eventId}/attendance?error=${encode(error.message || "Attendance could not be updated.")}`,
    );
  }

  revalidatePath(`/admin/events/${eventId}/attendance`);
  redirect(`/admin/events/${eventId}/attendance?success=attendance_updated`);
}
