import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const eventManagerRoles = new Set<AppRole>(["attendance_manager", "admin"]);

export function hasEventManagerRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => eventManagerRoles.has(role));
}

export async function requireEventManager(next = "/admin/events") {
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
    console.error("Unable to verify event operations authorization", {
      accountCode: accountResult.error?.code,
      rolesCode: rolesResult.error?.code,
    });
    redirect("/dashboard?error=event_authorization_unavailable");
  }

  const roles = rolesResult.data.map(({ role }) => role);
  if (accountResult.data?.status !== "active" || !hasEventManagerRole(roles)) {
    redirect("/dashboard?error=event_access_denied");
  }

  return { userId, roles };
}
