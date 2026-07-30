import Link from "next/link";

import { BrandLockup } from "@/components/brand-lockup";
import { createClient } from "@/lib/supabase/server";

export async function PortalHeader({
  status,
  lite = false,
}: {
  status?: string;
  dashboard?: boolean;
  lite?: boolean;
}) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const isSignedIn = !error && Boolean(data?.claims?.sub);

  return (
    <header className="site-header portal-header">
      <BrandLockup href={lite ? "/opportunities" : "/"} priority />
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/opportunities">Opportunities</Link>
        <Link href="/news">News</Link>
        <Link href={isSignedIn ? "/dashboard" : "/login"}>
          {isSignedIn ? "Dashboard" : "Sign in"}
        </Link>
      </nav>
      {status ? <p className="header-status">{status}</p> : null}
    </header>
  );
}
