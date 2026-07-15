import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

const contentManagerRoles = new Set<AppRole>([
  "content_editor",
  "publisher",
  "admin",
]);

const publisherRoles = new Set<AppRole>(["publisher", "admin"]);

export type ContentAccess = Readonly<{
  userId: string;
  roles: AppRole[];
  canPublish: boolean;
}>;

export function hasContentManagerRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => contentManagerRoles.has(role));
}

export function hasPublisherRole(roles: readonly AppRole[]): boolean {
  return roles.some((role) => publisherRoles.has(role));
}

export async function requireContentManager(options?: {
  publish?: boolean;
  next?: string;
}) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    const next = options?.next ?? "/admin/content";
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
    console.error("Unable to verify CMS authorization", {
      accountCode: accountResult.error?.code,
      rolesCode: rolesResult.error?.code,
    });
    redirect("/dashboard?error=cms_authorization_unavailable");
  }

  const roles = rolesResult.data?.map(({ role }) => role) ?? [];
  const access: ContentAccess = {
    userId,
    roles,
    canPublish: hasPublisherRole(roles),
  };

  if (accountResult.data?.status !== "active" || !hasContentManagerRole(roles)) {
    redirect("/dashboard?error=cms_access_denied");
  }

  if (options?.publish && !access.canPublish) {
    redirect("/admin/content?error=publisher_permission_required");
  }

  return { supabase, access };
}
