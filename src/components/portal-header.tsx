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
  let canManageAdmin = false;
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
      canManageAdmin = roles.has("admin");
      canManageEvents =
        roles.has("admin") ||
        roles.has("attendance_manager") ||
        roles.has("programme_manager");
      canManageVolunteers =
        roles.has("admin") || roles.has("support_officer");
      canManagePoints =
        roles.has("admin") || roles.has("gamification_manager");
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
          src="/brand/yayasan-mendaki.webp"
          width={1000}
          height={700}
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
          canManageAdmin={canManageAdmin}
          canManageEvents={canManageEvents}
          canManagePoints={canManagePoints}
          canManageVolunteers={canManageVolunteers}
          isSignedIn={isSignedIn}
        />
      </div>
    </header>
  );
}
