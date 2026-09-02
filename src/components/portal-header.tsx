import Link from "next/link";

import { BrandLockup } from "@/components/brand-lockup";
import { hasEventManagerRole } from "@/lib/auth/event-access";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

type PortalHeaderProps = {
  status?: string;
  dashboard?: boolean;
  lite?: boolean;
};

export async function PortalHeader({ status, dashboard }: PortalHeaderProps) {
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
      const roles = (roleRows ?? []).map(({ role }) => role) as AppRole[];
      canManageEvents = hasEventManagerRole(roles);
    }
  }

  return (
    <header className="site-header portal-header">
      <BrandLockup href="/" priority />
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/opportunities">Opportunities</Link>
        <Link href="/journey">Event Guide</Link>
        <Link href="/news">News</Link>
        {canManageEvents ? <Link href="/admin/events">Event Operations</Link> : null}
        {isSignedIn ? (
          <Link href="/dashboard">Dashboard</Link>
        ) : (
          <Link href="/login">Sign in</Link>
        )}
      </nav>
      {status ? <p className="header-status">{status}</p> : null}
    </header>
  );
}
