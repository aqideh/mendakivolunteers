import Link from "next/link";

import { BrandLockup } from "@/components/brand-lockup";
import { createClient } from "@/lib/supabase/server";

type PortalHeaderProps = {
  status?: string;
  dashboard?: boolean;
  lite?: boolean;
};

export async function PortalHeader({ status }: PortalHeaderProps) {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getClaims();
  const isSignedIn = !error && Boolean(data?.claims?.sub);

  return (
    <header className="site-header portal-header">
      <BrandLockup href="/" priority />
      <nav className="site-nav" aria-label="Primary navigation">
        <Link href="/opportunities">Opportunities</Link>
        <Link href="/journey">My Journey</Link>
        <Link href="/pathways">Pathways</Link>
        <Link href="/news">News</Link>
        {isSignedIn ? <Link href="/dashboard">Dashboard</Link> : null}
      </nav>
      {status ? <p className="header-status">{status}</p> : null}
    </header>
  );
}
