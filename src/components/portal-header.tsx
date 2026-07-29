import Link from "next/link";

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
      <Link className="brand-lockup" href={lite ? "/opportunities" : "/"}>
        <span className="brand-mark" aria-hidden="true">
          MV
        </span>
        <span>MENDAKI Volunteer Portal</span>
      </Link>
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
