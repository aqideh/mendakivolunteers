import { redirect } from "next/navigation";

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
