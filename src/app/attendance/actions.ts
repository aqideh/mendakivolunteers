"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  attendanceDeviceCookieName,
  attendanceDeviceMaxAge,
  createAttendanceDeviceToken,
  readAttendanceDeviceToken,
  resolveAttendanceQrToken,
} from "@/lib/phaseone/attendance-qr";
import { resolveAuthenticatedAttendancePerson } from "@/lib/phaseone/attendance-identity";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().min(20).max(200);
const feedbackSchema = z.object({
  eventId: z.string().uuid(),
  briefingThorough: z.coerce.number().int().min(1).max(5),
  onboardingRoleUnderstanding: z.coerce.number().int().min(1).max(5),
  roleSatisfaction: z.coerce.number().int().min(1).max(5),
  staffSupport: z.coerce.number().int().min(1).max(5),
  suggestions: z.string().trim().max(1500).optional(),
});

function scanPath(token: string, params?: Record<string, string>) {
  const query = new URLSearchParams({ t: token, ...params });
  return `/attendance/scan?${query.toString()}`;
}

async function setDeviceIdentity(eventId: string, personKey: string) {
  const store = await cookies();
  store.set(attendanceDeviceCookieName, createAttendanceDeviceToken(eventId, personKey), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: attendanceDeviceMaxAge,
    path: "/attendance",
  });
}

async function attendanceContext(token: string) {
  const qr = await resolveAttendanceQrToken(token);
  if (!qr) return null;

  const identity = await resolveAuthenticatedAttendancePerson(
    qr.event_id,
    qr.timeslot_id,
  );

  const matched =
    identity.state === "matched"
      ? {
          id: identity.rosterId,
          volunteer_name: identity.volunteerName,
          attendance_person_key: identity.personKey,
        }
      : null;

  return { qr, identity, matched };
}

export async function resolveAttendancePersonForToken(token: string) {
  const context = await attendanceContext(token);
  if (!context) return null;

  return {
    context: { qr: context.qr },
    matched: context.matched,
    identityState: context.identity.state,
  };
}

export async function confirmQrAttendance(formData: FormData) {
  const tokenResult = tokenSchema.safeParse(formData.get("token"));
  if (!tokenResult.success) redirect("/attendance/scan?error=expired");
  const token = tokenResult.data;
  const resolved = await resolveAttendancePersonForToken(token);
  if (!resolved?.context) redirect(scanPath(token, { error: "expired" }));
  if (!resolved.matched) {
    if (resolved.identityState === "signed_out") {
      redirect(`/login?next=${encodeURIComponent(scanPath(token))}`);
    }
    redirect(scanPath(token, { error: resolved.identityState }));
  }

  const { qr } = resolved.context;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.rpc("phaseone_apply_qr_attendance", {
    p_event_id: qr.event_id,
    p_roster_id: resolved.matched.id,
    p_action: qr.action,
    p_timestamp: new Date().toISOString(),
  });
  if (error) {
    console.error("QR attendance failed", { code: error.code, eventId: qr.event_id, action: qr.action });
    redirect(scanPath(token, { error: "attendance_failed" }));
  }

  await setDeviceIdentity(qr.event_id, resolved.matched.attendance_person_key);
  const result = data as { status?: string } | null;
  const status = result?.status ?? "recorded";
  if (qr.action === "check_out" && (status === "checked_out" || status === "already_checked_out")) {
    redirect(`/attendance/feedback?event=${encodeURIComponent(qr.event_id)}&status=${encodeURIComponent(status)}`);
  }
  redirect(`/attendance/complete?event=${encodeURIComponent(qr.event_id)}&action=check_in&status=${encodeURIComponent(status)}`);
}

export async function submitEventFeedback(formData: FormData) {
  const parsed = feedbackSchema.safeParse({
    eventId: formData.get("eventId"),
    briefingThorough: formData.get("briefingThorough"),
    onboardingRoleUnderstanding: formData.get("onboardingRoleUnderstanding"),
    roleSatisfaction: formData.get("roleSatisfaction"),
    staffSupport: formData.get("staffSupport"),
    suggestions: String(formData.get("suggestions") ?? ""),
  });
  if (!parsed.success) redirect(`/attendance/feedback?event=${encodeURIComponent(String(formData.get("eventId") ?? ""))}&error=invalid_feedback`);

  const store = await cookies();
  const device = readAttendanceDeviceToken(store.get(attendanceDeviceCookieName)?.value);
  if (!device || device.eventId !== parsed.data.eventId) redirect("/attendance/feedback?error=identity_expired");

  const admin = getPhaseOneAdminClient();
  const { data: roster } = await admin
    .from("phaseone_roster")
    .select("id")
    .eq("event_id", parsed.data.eventId)
    .eq("attendance_person_key", device.personKey)
    .or("source_assignment_status.is.null,source_assignment_status.neq.invalidated_historical_shift_match")
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("phaseone_event_feedback").upsert({
    event_id: parsed.data.eventId,
    roster_id: roster?.id ?? null,
    volunteer_person_key: device.personKey,
    briefing_thorough: parsed.data.briefingThorough,
    onboarding_role_understanding: parsed.data.onboardingRoleUnderstanding,
    role_satisfaction: parsed.data.roleSatisfaction,
    staff_support: parsed.data.staffSupport,
    suggestions: parsed.data.suggestions || null,
    follow_up_requested: false,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,volunteer_person_key" });

  if (error) {
    console.error("Volunteer event feedback failed", { code: error.code, eventId: parsed.data.eventId });
    redirect(`/attendance/feedback?event=${encodeURIComponent(parsed.data.eventId)}&error=save_failed`);
  }
  redirect(`/attendance/complete?event=${encodeURIComponent(parsed.data.eventId)}&action=feedback&status=saved`);
}
