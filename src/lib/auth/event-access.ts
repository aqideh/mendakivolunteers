import { redirect } from "next/navigation";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const attendanceOperatorRoles = new Set<AppRole>([
  "volunteer_leader",
  "staff",
  "volteam",
  "admin",
]);

const eventManagerRoles = new Set<AppRole>([
  "staff",
  "volteam",
  "admin",
]);

const programmeManagerRoles = new Set<AppRole>([
  "volteam",
  "admin",
]);

export function hasAttendanceOperatorRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => attendanceOperatorRoles.has(role));
}

export function hasEventManagerRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => eventManagerRoles.has(role));
}

export function hasProgrammeManagerRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => programmeManagerRoles.has(role));
}

async function requireEventAccess(
  allowed: (roles: readonly AppRole[]) => boolean,
  next: string,
  deniedError: string,
) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const [accountResult, rolesResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  if (accountResult.error || rolesResult.error) {
    console.error("Unable to verify event authorization", {
      accountCode: accountResult.error?.code,
      rolesCode: rolesResult.error?.code,
    });
    redirect("/dashboard?error=event_authorization_unavailable");
  }

  const roles = rolesResult.data.map(({ role }) => role);
  if (accountResult.data?.status !== "active" || !allowed(roles)) {
    redirect(`/dashboard?error=${deniedError}`);
  }

  return { userId, roles };
}

export async function requireAttendanceOperator(next = "/admin/events") {
  return requireEventAccess(
    hasAttendanceOperatorRole,
    next,
    "event_access_denied",
  );
}

export async function requireAttendanceOperatorForEvent(
  eventId: string,
  next = `/admin/events/${eventId}/attendance`,
) {
  const access = await requireEventAccess(
    hasAttendanceOperatorRole,
    next,
    "event_access_denied",
  );

  if (hasEventManagerRole(access.roles)) {
    return access;
  }

  if (!access.roles.includes("volunteer_leader")) {
    redirect("/dashboard?error=event_access_denied");
  }

  const admin = getPhaseOneAdminClient();
  const { data: assignment, error } = await admin
    .from("phaseone_event_volunteer_leaders")
    .select("event_id")
    .eq("event_id", eventId)
    .eq("user_id", access.userId)
    .maybeSingle();

  if (error) {
    console.error("Unable to verify Volunteer Leader event assignment", {
      code: error.code,
      eventId,
      userId: access.userId,
    });
    redirect("/dashboard?error=event_authorization_unavailable");
  }

  if (!assignment) {
    redirect("/admin/events?error=event_assignment_required");
  }

  return access;
}

export async function getAttendanceOperatorEventIds(
  userId: string,
  roles: readonly AppRole[],
): Promise<ReadonlySet<string> | null> {
  if (hasEventManagerRole(roles)) {
    return null;
  }

  if (!roles.includes("volunteer_leader")) {
    return new Set<string>();
  }

  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin
    .from("phaseone_event_volunteer_leaders")
    .select("event_id")
    .eq("user_id", userId);

  if (error) {
    console.error("Unable to load Volunteer Leader event assignments", {
      code: error.code,
      userId,
    });
    throw new Error("Event assignments could not be loaded");
  }

  return new Set((data ?? []).map((assignment) => assignment.event_id));
}

export async function requireEventManager(next = "/admin/events") {
  return requireEventAccess(hasEventManagerRole, next, "event_access_denied");
}

export async function requireProgrammeManager(next = "/admin/events") {
  return requireEventAccess(
    hasProgrammeManagerRole,
    next,
    "programme_management_access_denied",
  );
}
