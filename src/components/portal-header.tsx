import { BrandLockup } from "@/components/brand-lockup";
import { PortalNav } from "@/components/portal-nav";
import { hasEventManagerRole } from "@/lib/auth/event-access";
import { createClient } from "@/lib/supabase/server";

export async function PortalHeader({
  status,
  dashboard = false,
  lite = false,
}: {
  status: string;
  dashboard?: boolean;
  lite?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const userId = data?.claims?.sub;
  const isSignedIn = !error && Boolean(userId);
  let canManageEvents = false;

  if (dashboard && isSignedIn && userId) {
    const { data: roleRows, error: rolesError } = await supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId);

    if (rolesError) {
      console.error("Unable to load event operations navigation permission", {
        rolesCode: rolesError.code,
      });
    } else {
      canManageEvents = hasEventManagerRole(
        (roleRows ?? []).map(({ role }) => role),
      );
    }
  }

  return (
    <header className="site-header portal-header">
      <BrandLockup href="/" priority />
      <PortalNav
        canManageEvents={canManageEvents}
        isSignedIn={isSignedIn}
      />
      {!lite ? <p className="header-status">{status}</p> : null}
    </header>
  );
}
