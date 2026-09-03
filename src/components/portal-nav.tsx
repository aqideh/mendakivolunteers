"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type PortalNavProps = Readonly<{
  canManageEvents: boolean;
  isSignedIn: boolean;
}>;

type NavigationItem = Readonly<{
  href: string;
  label: string;
}>;

function matchesPath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function PortalNav({ canManageEvents, isSignedIn }: PortalNavProps) {
  const pathname = usePathname() ?? "";
  const items: NavigationItem[] = [
    { href: "/opportunities", label: "Opportunities" },
    { href: "/journey", label: "Event Guide" },
    { href: "/points", label: "Points" },
    { href: "/news", label: "News" },
  ];

  if (canManageEvents) {
    items.push({ href: "/admin/events", label: "Event Operations" });
  }

  items.push(
    isSignedIn
      ? { href: "/dashboard", label: "Dashboard" }
      : { href: "/login", label: "Sign in" },
  );

  return (
    <nav className="site-nav" aria-label="Primary navigation">
      {items.map(({ href, label }) => {
        const isCurrent = matchesPath(pathname, href);
        return (
          <Link
            key={href}
            href={href}
            aria-current={isCurrent ? "page" : undefined}
          >
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
