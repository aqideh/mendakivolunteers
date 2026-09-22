"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

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
  const [isOpen, setIsOpen] = useState(false);
  const items: NavigationItem[] = [
    { href: "/opportunities", label: "Opportunities" },
  ];

  if (canManageEvents) {
    items.push({ href: "/admin/events", label: "Event Operations" });
  }

  items.push(
    isSignedIn
      ? { href: "/dashboard", label: "My Profile" }
      : { href: "/login", label: "Login" },
  );

  return (
    <div className="portal-menu">
      <button
        className="portal-menu-toggle"
        type="button"
        aria-expanded={isOpen}
        aria-controls="primary-navigation-menu"
        aria-label={isOpen ? "Close navigation menu" : "Open navigation menu"}
        onClick={() => setIsOpen((open) => !open)}
      >
        <span aria-hidden="true" />
        <span aria-hidden="true" />
        <span aria-hidden="true" />
      </button>

      <nav
        id="primary-navigation-menu"
        className="site-nav portal-menu-panel"
        aria-label="Primary navigation"
        data-open={isOpen ? "true" : "false"}
      >
        {items.map(({ href, label }) => {
          const isCurrent = matchesPath(pathname, href);
          return (
            <Link
              key={href}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              onClick={() => setIsOpen(false)}
            >
              {label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
