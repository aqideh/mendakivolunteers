import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const eventOperatorRoles = new Set<AppRole>([
  "attendance_manager",
  "programme_manager",
  "admin",
]);

const programmeManagerRoles = new Set<AppRole>([
  "programme_manager",
  "admin",
]);

export function hasEventManagerRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => eventOperatorRoles.has(role));
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
