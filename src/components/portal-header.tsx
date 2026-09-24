import Image from "next/image";
import Link from "next/link";

import { PortalNav } from "@/components/portal-nav";
import { createClient } from "@/lib/supabase/server";

export async function PortalHeader({
  status,
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
  let canManagePoints = false;
  let canManageVolunteers = false;

  if (isSignedIn && userId) {
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
      const roles = new Set((roleRows ?? []).map(({ role }) => String(role)));
      canManageEvents =
        roles.has("admin") ||
        roles.has("volteam") ||
        roles.has("staff") ||
        roles.has("volunteer_leader");
      canManageVolunteers =
        roles.has("admin") || roles.has("volteam");
      canManagePoints =
        roles.has("admin") || roles.has("volteam");
    }
  }

  return (
    <header className="site-header portal-header">
      <Link
        className="portal-brand-logo-link"
        href="/"
        aria-label="Keluarga MENDAKI home"
      >
        <Image
          className="brand-logo"
          src="/brand/yayasan-mendaki-yellow.png"
          width={2048}
          height={1228}
          alt=""
          priority
          unoptimized
        />
      </Link>

      {!lite ? <p className="header-status">{status}</p> : null}

      <div className="portal-header-end">
        <Link
          className="portal-brand-copy-link"
          href="/"
          aria-label="Keluarga MENDAKI — Volunteer for Impact!"
        >
          <span className="brand-copy">
            <span className="brand-name">Keluarga MENDAKI</span>
            <span className="brand-title">Volunteer for Impact!</span>
          </span>
        </Link>
        <PortalNav
          canManageEvents={canManageEvents}
          canManagePoints={canManagePoints}
          canManageVolunteers={canManageVolunteers}
          isSignedIn={isSignedIn}
        />
      </div>
    </header>
  );
}
