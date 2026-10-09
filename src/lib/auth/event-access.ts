import { redirect } from "next/navigation";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const attendanceOperatorRoles = new Set<AppRole>([
  "volunteer_leader",
  "volunteer",
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

  if (!access.roles.includes("volunteer_leader") && !access.roles.includes("volunteer")) {
    redirect("/dashboard?error=event_access_denied");
  }

  const admin = getPhaseOneAdminClient();
  const [{ data: assignments, error }, { data: volunteer, error: volunteerError }] =
    await Promise.all([
      admin.from("phaseone_event_volunteer_leaders")
        .select("event_id, user_id, volunteer_id")
        .eq("event_id", eventId),
      admin.schema("core").from("volunteers").select("id")
        .eq("auth_user_id", access.userId).maybeSingle(),
    ]);

  if (error || volunteerError) {
    console.error("Unable to verify scoped event assignment", { eventId, code: error?.code ?? volunteerError?.code });
    redirect("/dashboard?error=event_authorization_unavailable");
  }

  const assigned = (assignments ?? []).some((row) =>
    row.user_id === access.userId || (volunteer && row.volunteer_id === volunteer.id));
  if (!assigned) redirect("/admin/events?error=event_assignment_required");

  return access;
}

export async function getAttendanceOperatorEventIds(
  userId: string,
  roles: readonly AppRole[],
): Promise<ReadonlySet<string> | null> {
  if (hasEventManagerRole(roles)) {
    return null;
  }

  if (!roles.includes("volunteer_leader") && !roles.includes("volunteer")) {
    return new Set<string>();
  }

  const admin = getPhaseOneAdminClient();
  const [{ data: volunteer, error: volunteerError }, { data, error }] = await Promise.all([
    admin.schema("core").from("volunteers").select("id")
      .eq("auth_user_id", userId).maybeSingle(),
    admin.from("phaseone_event_volunteer_leaders")
      .select("event_id, user_id, volunteer_id").limit(5000),
  ]);

  if (error || volunteerError) {
    console.error("Unable to load scoped event assignments", { code: error?.code ?? volunteerError?.code });
    throw new Error("Event assignments could not be loaded");
  }
  return new Set((data ?? []).filter((row) =>
    row.user_id === userId || (volunteer && row.volunteer_id === volunteer.id))
    .map((row) => row.event_id));
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
