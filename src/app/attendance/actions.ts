"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  attendanceDeviceCookieName,
  attendanceDeviceMaxAge,
  canonicalMobile,
  createAttendanceDeviceToken,
  readAttendanceDeviceToken,
  resolveAttendanceQrToken,
} from "@/lib/phaseone/attendance-qr";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

const tokenSchema = z.string().min(20).max(200);
const identifierSchema = z.string().trim().min(3).max(320);
const feedbackSchema = z.object({
  eventId: z.string().uuid(),
  roleClarity: z.coerce.number().int().min(1).max(5),
  roleSatisfaction: z.coerce.number().int().min(1).max(5),
  staffSupport: z.coerce.number().int().min(1).max(5),
  recommend: z.coerce.number().int().min(1).max(5),
  suggestions: z.string().trim().max(1500).optional(),
  followUpRequested: z.boolean(),
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

async function authenticatedEmail(): Promise<string | null> {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  if (claimsError || !claimsData?.claims?.sub) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user?.email || !(data.user.email_confirmed_at ?? data.user.confirmed_at)) return null;
  return data.user.email.trim().toLowerCase();
}

async function rosterForQr(token: string) {
  const qr = await resolveAttendanceQrToken(token);
  if (!qr) return null;
  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .from("phaseone_roster")
    .select("id, volunteer_name, email_normalized, mobile, attendance_person_key")
    .eq("event_id", qr.event_id)
    .eq("timeslot_id", qr.timeslot_id)
    .limit(2000);
  if (error || !data) return null;
  return { qr, roster: data };
}

function uniquePersonMatch<T extends { attendance_person_key: string }>(matches: T[]): T | null {
  const keys = new Set(matches.map((row) => row.attendance_person_key));
  return keys.size === 1 ? matches[0] ?? null : null;
}

export async function resolveAttendancePersonForToken(token: string) {
  const context = await rosterForQr(token);
  if (!context) return null;

  const store = await cookies();
  const device = readAttendanceDeviceToken(store.get(attendanceDeviceCookieName)?.value);
  if (device?.eventId === context.qr.event_id) {
    const matched = uniquePersonMatch(
      context.roster.filter((row) => row.attendance_person_key === device.personKey),
    );
    if (matched) return { context, matched, source: "device" as const };
  }

  const email = await authenticatedEmail();
  if (email) {
    const matched = uniquePersonMatch(
      context.roster.filter((row) => row.email_normalized === email),
    );
    if (matched) return { context, matched, source: "account" as const };
  }

  return { context, matched: null, source: "none" as const };
}

export async function identifyAttendanceVolunteer(formData: FormData) {
  const tokenResult = tokenSchema.safeParse(formData.get("token"));
  const identifierResult = identifierSchema.safeParse(formData.get("identifier"));
  if (!tokenResult.success || !identifierResult.success) {
    redirect("/attendance/scan?error=invalid_details");
  }
  const token = tokenResult.data;
  const context = await rosterForQr(token);
  if (!context) redirect(scanPath(token, { error: "expired" }));

  const identifier = identifierResult.data;
  const email = identifier.includes("@") ? identifier.toLowerCase() : null;
  const mobile = email ? null : canonicalMobile(identifier);
  const matches = context.roster.filter((row) =>
    email ? row.email_normalized === email : Boolean(mobile) && canonicalMobile(row.mobile ?? "") === mobile,
  );
  const matched = uniquePersonMatch(matches);
  if (!matched) redirect(scanPath(token, { error: "not_found" }));

  await setDeviceIdentity(context.qr.event_id, matched.attendance_person_key);
  redirect(scanPath(token, { matched: "1" }));
}

export async function confirmQrAttendance(formData: FormData) {
  const tokenResult = tokenSchema.safeParse(formData.get("token"));
  if (!tokenResult.success) redirect("/attendance/scan?error=expired");
  const token = tokenResult.data;
  const resolved = await resolveAttendancePersonForToken(token);
  if (!resolved?.context || !resolved.matched) redirect(scanPath(token, { error: "identify_first" }));

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
    roleClarity: formData.get("roleClarity"),
    roleSatisfaction: formData.get("roleSatisfaction"),
    staffSupport: formData.get("staffSupport"),
    recommend: formData.get("recommend"),
    suggestions: String(formData.get("suggestions") ?? ""),
    followUpRequested: formData.get("followUpRequested") === "on",
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
    .limit(1)
    .maybeSingle();

  const { error } = await admin.from("phaseone_event_feedback").upsert({
    event_id: parsed.data.eventId,
    roster_id: roster?.id ?? null,
    volunteer_person_key: device.personKey,
    role_clarity: parsed.data.roleClarity,
    role_satisfaction: parsed.data.roleSatisfaction,
    staff_support: parsed.data.staffSupport,
    recommend: parsed.data.recommend,
    suggestions: parsed.data.suggestions || null,
    follow_up_requested: parsed.data.followUpRequested,
    submitted_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: "event_id,volunteer_person_key" });

  if (error) {
    console.error("Volunteer event feedback failed", { code: error.code, eventId: parsed.data.eventId });
    redirect(`/attendance/feedback?event=${encodeURIComponent(parsed.data.eventId)}&error=save_failed`);
  }
  redirect(`/attendance/complete?event=${encodeURIComponent(parsed.data.eventId)}&action=feedback&status=saved`);
}
