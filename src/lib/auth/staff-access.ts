import { redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account-access";
import { internalStaffRoleValues } from "@/lib/auth/staff-roles";

export async function requireAdmin(next = "/admin/staff") {
  const { supabase, userId } = await requireActiveAccount(next);
  const { data: roles, error } = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (error) {
    console.error("Unable to verify staff administration authorization", {
      code: error.code,
    });
    redirect("/dashboard?error=staff_authorization_unavailable");
  }

  if (!(roles ?? []).some(({ role }) => role === "admin")) {
    redirect("/dashboard?error=staff_access_denied");
  }

  return { supabase, userId };
}


export async function requireInternalStaff(next = "/admin/events") {
  const { supabase, userId } = await requireActiveAccount(next);
  const { data: roles, error } = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .in("role", [...internalStaffRoleValues]);

  if (error) {
    console.error("Unable to verify internal staff authorization", {
      code: error.code,
    });
    redirect("/dashboard?error=staff_authorization_unavailable");
  }

  if ((roles ?? []).length === 0) {
    redirect("/dashboard?error=staff_access_denied");
  }

  return { supabase, userId };
}
