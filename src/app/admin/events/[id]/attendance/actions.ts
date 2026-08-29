"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const attendanceActionSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  action: z.enum([
    "mark_sign_in",
    "mark_sign_out",
    "clear_sign_in",
    "clear_sign_out",
    "mark_withdrawn",
    "mark_absent",
    "clear_non_attendance",
  ]),
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

const quickAttendanceActionSchema = z.enum([
  "mark_sign_in",
  "mark_sign_out",
  "mark_withdrawn",
  "mark_absent",
  "clear_non_attendance",
]);

const quickAttendanceSchema = z.object({
  eventId: z.string().uuid(),
  rosterId: z.string().uuid(),
  action: quickAttendanceActionSchema,
  timeslotId: z.string().uuid().optional(),
});

const bulkCheckoutSchema = z.object({
  eventId: z.string().uuid(),
  timeslotId: z.string().uuid(),
});

const walkInSchema = z.object({
  eventId: z.string().uuid(),
  timeslotId: z.string().uuid(),
  volunteerName: z.string().trim().min(1).max(200),
  volunteerKey: z.string().trim().max(100).optional(),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  mobile: z.string().trim().max(50).optional(),
  tshirtSize: z.string().trim().max(20).optional(),
  submitIntent: z.enum(["add_and_check_in", "add_only"]),
});

type QuickAttendanceAction = z.infer<typeof quickAttendanceActionSchema>;
type NonAttendanceStatus = "withdrawn" | "absent";

export type QuickAttendanceResult =
  | {
      ok: true;
      action: QuickAttendanceAction;
      signedInAt: string | null;
      signedOutAt: string | null;
      nonAttendanceStatus: NonAttendanceStatus | null;
      updatedAt: string | null;
    }
  | { ok: false; error: string };

export type BulkCheckoutResult =
  | { ok: true; checkedOut: number }
  | { ok: false; checkedOut: number; error: string };

const quickActionReasons: Record<QuickAttendanceAction, string> = {
  mark_sign_in: "Staff check-in",
  mark_sign_out: "Staff check-out",
  mark_withdrawn: "Staff marked volunteer as withdrawn",
  mark_absent: "Staff marked volunteer as absent",
  clear_non_attendance: "Staff cleared volunteer non-attendance status",
};

function encode(value: string): string {
  return encodeURIComponent(value);
}

function attendancePath(eventId: string, timeslotId?: string) {
  const suffix = timeslotId ? `?timeslot=${encode(timeslotId)}` : "";
  return `/admin/events/${eventId}/attendance${suffix}`;
}

function appendParameter(path: string, key: string, value: string): string {
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}${key}=${encode(value)}`;
}

export async function addWalkInVolunteer(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const timeslotId = String(formData.get("timeslotId") ?? "");
  const returnPath = attendancePath(eventId, timeslotId || undefined);
  const parsed = walkInSchema.safeParse({
    eventId,
    timeslotId,
    volunteerName: formData.get("volunteerName"),
    volunteerKey: formData.get("volunteerKey") || undefined,
    email: formData.get("email") || "",
    mobile: formData.get("mobile") || undefined,
    tshirtSize: formData.get("tshirtSize") || undefined,
    submitIntent: formData.get("submitIntent"),
  });

  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the volunteer details.";
    redirect(appendParameter(returnPath, "error", message));
  }

  const { userId } = await requireEventManager(returnPath);
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.rpc("phaseone_add_walk_in_volunteer", {
    p_event_id: parsed.data.eventId,
    p_timeslot_id: parsed.data.timeslotId,
    p_volunteer_key: parsed.data.volunteerKey || null,
    p_volunteer_name: parsed.data.volunteerName,
    p_email: parsed.data.email || null,
    p_mobile: parsed.data.mobile || null,
    p_tshirt_size: parsed.data.tshirtSize || null,
    p_check_in: parsed.data.submitIntent === "add_and_check_in",
    p_changed_by: userId,
  });

  if (error) {
    console.error("Unable to add last-minute volunteer", {
      code: error.code,
      eventId: parsed.data.eventId,
      timeslotId: parsed.data.timeslotId,
    });
    redirect(
      appendParameter(
        returnPath,
        "error",
        error.message || "The last-minute volunteer could not be added.",
      ),
    );
  }

  const result = data as { status?: string; roster_id?: string; checked_in?: boolean } | null;

  if (result?.status === "duplicate_completed") {
    let path = appendParameter(
      returnPath,
      "error",
      "This volunteer is already on the roster and has already checked out for this shift.",
    );
    if (result.roster_id) path = appendParameter(path, "highlight", result.roster_id);
    redirect(path);
  }

  if (result?.status === "duplicate") {
    if (parsed.data.submitIntent === "add_and_check_in" && result.checked_in) {
      revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
      let path = appendParameter(returnPath, "success", "attendance_recorded");
      if (result.roster_id) path = appendParameter(path, "highlight", result.roster_id);
      redirect(path);
    }

    let path = appendParameter(
      returnPath,
      "error",
      "This volunteer is already on the roster for this shift.",
    );
    if (result.roster_id) path = appendParameter(path, "highlight", result.roster_id);
    redirect(path);
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  let path = appendParameter(
    returnPath,
    "success",
    result?.checked_in ? "walk_in_checked_in" : "walk_in_added",
  );
  if (result?.roster_id) path = appendParameter(path, "highlight", result.roster_id);
  redirect(path);
}

export async function recordAttendanceQuickAction(input: {
  eventId: string;
  rosterId: string;
  action: QuickAttendanceAction;
  timeslotId?: string | undefined;
}): Promise<QuickAttendanceResult> {
  const parsed = quickAttendanceSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Attendance action could not be read." };
  }

  const returnPath = attendancePath(parsed.data.eventId, parsed.data.timeslotId);
  const { userId } = await requireEventManager(returnPath);
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.rpc("phaseone_apply_attendance_transition", {
    p_event_id: parsed.data.eventId,
    p_roster_id: parsed.data.rosterId,
    p_action: parsed.data.action,
    p_timestamp: null,
    p_reason: quickActionReasons[parsed.data.action],
    p_changed_by: userId,
  });

  if (error) {
    console.error("Unable to record staff attendance action", {
      code: error.code,
      eventId: parsed.data.eventId,
      rosterId: parsed.data.rosterId,
      action: parsed.data.action,
    });
    return { ok: false, error: error.message || "Attendance could not be recorded." };
  }

  const attendance = data as {
    signed_in_at?: string | null;
    signed_out_at?: string | null;
    non_attendance_status?: NonAttendanceStatus | null;
    updated_at?: string | null;
  } | null;

  return {
    ok: true,
    action: parsed.data.action,
    signedInAt: attendance?.signed_in_at ?? null,
    signedOutAt: attendance?.signed_out_at ?? null,
    nonAttendanceStatus: attendance?.non_attendance_status ?? null,
    updatedAt: attendance?.updated_at ?? null,
  };
}

export async function checkoutAllCurrentParticipants(input: {
  eventId: string;
  timeslotId: string;
}): Promise<BulkCheckoutResult> {
  const parsed = bulkCheckoutSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, checkedOut: 0, error: "Bulk check-out could not be read." };
  }

  const returnPath = attendancePath(parsed.data.eventId, parsed.data.timeslotId);
  const { userId } = await requireEventManager(returnPath);
  const admin = getPhaseOneAdminClient();
  const [rosterResult, attendanceResult] = await Promise.all([
    admin
      .from("phaseone_roster")
      .select("id")
      .eq("event_id", parsed.data.eventId)
      .eq("timeslot_id", parsed.data.timeslotId)
      .limit(2000),
    admin
      .from("phaseone_attendance")
      .select("roster_id, signed_in_at, signed_out_at, non_attendance_status")
      .eq("event_id", parsed.data.eventId)
      .limit(2000),
  ]);

  if (rosterResult.error || attendanceResult.error) {
    console.error("Unable to load bulk check-out candidates", {
      eventId: parsed.data.eventId,
      timeslotId: parsed.data.timeslotId,
      rosterCode: rosterResult.error?.code,
      attendanceCode: attendanceResult.error?.code,
    });
    return { ok: false, checkedOut: 0, error: "Checked-in volunteers could not be loaded." };
  }

  const rosterIds = new Set((rosterResult.data ?? []).map((row) => row.id));
  const eligibleRosterIds = (attendanceResult.data ?? [])
    .filter((row) =>
      rosterIds.has(row.roster_id)
      && row.signed_in_at
      && !row.signed_out_at
      && !row.non_attendance_status,
    )
    .map((row) => row.roster_id);

  if (eligibleRosterIds.length === 0) {
    return { ok: true, checkedOut: 0 };
  }

  const sharedTimestamp = new Date().toISOString();
  let checkedOut = 0;
  let failed = 0;
  const batchSize = 20;

  for (let index = 0; index < eligibleRosterIds.length; index += batchSize) {
    const batch = eligibleRosterIds.slice(index, index + batchSize);
    const results = await Promise.all(
      batch.map(async (rosterId) => {
        const { error } = await admin.rpc("phaseone_apply_attendance_transition", {
          p_event_id: parsed.data.eventId,
          p_roster_id: rosterId,
          p_action: "mark_sign_out",
          p_timestamp: sharedTimestamp,
          p_reason: "Staff bulk check-out",
          p_changed_by: userId,
        });
        return { rosterId, error };
      }),
    );

    for (const result of results) {
      if (!result.error) {
        checkedOut += 1;
        continue;
      }

      // A concurrent individual check-out has already achieved the desired final state.
      if (result.error.message?.toLowerCase().includes("already checked out")) {
        continue;
      }

      failed += 1;
      console.error("Unable to bulk check out volunteer", {
        code: result.error.code,
        eventId: parsed.data.eventId,
        timeslotId: parsed.data.timeslotId,
        rosterId: result.rosterId,
      });
    }
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);

  if (failed > 0) {
    return {
      ok: false,
      checkedOut,
      error: `${checkedOut} volunteer${checkedOut === 1 ? "" : "s"} checked out, but ${failed} could not be updated. Refresh and retry the remaining checked-in volunteers.`,
    };
  }

  return { ok: true, checkedOut };
}

// Retained as a progressively enhanced fallback for any existing form callers.
export async function recordAttendanceAction(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const parsed = quickAttendanceSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    action: formData.get("action"),
    timeslotId: formData.get("timeslotId") || undefined,
  });

  if (!parsed.success) {
    redirect(`${attendancePath(eventId)}?error=${encode("Attendance action could not be read.")}`);
  }

  const result = await recordAttendanceQuickAction(parsed.data);
  const returnPath = attendancePath(parsed.data.eventId, parsed.data.timeslotId);

  if (!result.ok) {
    const separator = returnPath.includes("?") ? "&" : "?";
    redirect(`${returnPath}${separator}error=${encode(result.error)}`);
  }

  revalidatePath(`/admin/events/${parsed.data.eventId}/attendance`);
  const separator = returnPath.includes("?") ? "&" : "?";
  redirect(`${returnPath}${separator}success=attendance_recorded`);
}

export async function applyAttendanceChange(formData: FormData) {
  const eventId = String(formData.get("eventId") ?? "");
  const timeslotId = String(formData.get("timeslotId") ?? "").trim() || undefined;
  const parsed = attendanceActionSchema.safeParse({
    eventId,
    rosterId: formData.get("rosterId"),
    action: formData.get("action"),
    timestamp: formData.get("timestamp"),
    reason: formData.get("reason"),
  });

  const returnPath = attendancePath(eventId, timeslotId);
  if (!parsed.success) {
    const message = parsed.error.issues[0]?.message ?? "Check the attendance correction.";
    const separator = returnPath.includes("?") ? "&" : "?";
    redirect(`${returnPath}${separator}error=${encode(message)}`);
  }

  const { userId } = await requireEventManager(returnPath);
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
    const separator = returnPath.includes("?") ? "&" : "?";
    redirect(`${returnPath}${separator}error=${encode(error.message || "Attendance could not be updated.")}`);
  }

  revalidatePath(`/admin/events/${eventId}/attendance`);
  const separator = returnPath.includes("?") ? "&" : "?";
  redirect(`${returnPath}${separator}success=attendance_updated`);
}
