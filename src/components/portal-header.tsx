import Link from "next/link";

export function PortalHeader({
  status,
  dashboard = false,
  lite = false,
}: {
  status?: string;
  dashboard?: boolean;
  lite?: boolean;
}) {
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
        {lite ? (
          <Link href="/login">Staff sign in</Link>
        ) : (
          <>
            <Link href="/news">News</Link>
            <Link href={dashboard ? "/dashboard" : "/login"}>
              {dashboard ? "Dashboard" : "Sign in"}
            </Link>
          </>
        )}
      </nav>
      {status ? <p className="header-status">{status}</p> : null}
    </header>
  );
}
