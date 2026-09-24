"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";

type PortalNavProps = Readonly<{
  canManageEvents: boolean;
  canManagePoints: boolean;
  canManageVolunteers: boolean;
  isSignedIn: boolean;
}>;

type NavigationItem = Readonly<{
  href: string;
  label: string;
}>;

function matchesPath(pathname: string, item: NavigationItem): boolean {
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

export function PortalNav({
  canManageEvents,
  canManagePoints,
  canManageVolunteers,
  isSignedIn,
}: PortalNavProps) {
  const pathname = usePathname() ?? "";
  const [isOpen, setIsOpen] = useState(false);
  const items: NavigationItem[] = [
    { href: "/opportunities", label: "Opportunities" },
    { href: "/faq", label: "FAQ" },
  ];


  if (canManageVolunteers) {
    items.push({ href: "/admin/recruitment", label: "Volunteer Recruitment" });
  }

  if (canManageEvents) {
    items.push({ href: "/admin/events", label: "Event Operations" });
  }

  if (canManagePoints) {
    items.push({ href: "/admin/points", label: "Points Management" });
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
        {items.map((item) => {
          const { href, label } = item;
          const isCurrent = matchesPath(pathname, item);
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
