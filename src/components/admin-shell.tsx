"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import styles from "./admin-shell.module.css";

type AdminShellProps = Readonly<{
  children: React.ReactNode;
  roles: readonly string[];
  email: string | undefined;
}>;

type NavItem = Readonly<{
  href: string;
  label: string;
  icon: IconName;
  exact?: boolean;
  external?: boolean;
  adminOnly?: boolean;
  fullAdminOnly?: boolean;
}>;

type IconName =
  | "dashboard"
  | "events"
  | "registrations"
  | "volunteers"
  | "reconciliation"
  | "content"
  | "image"
  | "network"
  | "pathways"
  | "shirt"
  | "points"
  | "badges"
  | "staff"
  | "database"
  | "profile"
  | "home";

const navGroups: ReadonlyArray<Readonly<{ title: string; items: readonly NavItem[] }>> = [
  {
    title: "Manage",
    items: [
      { href: "/admin", label: "Dashboard", icon: "dashboard", exact: true, fullAdminOnly: true },
      { href: "/admin/events", label: "Event Operations", icon: "events" },
      { href: "/admin/registrations", label: "Registrations", icon: "registrations", fullAdminOnly: true },
      { href: "/admin/volunteers", label: "Volunteers", icon: "volunteers", fullAdminOnly: true },
      { href: "/admin/reconciliation", label: "Reconciliation", icon: "reconciliation", fullAdminOnly: true },
      { href: "/admin/content", label: "Content & Opportunities", icon: "content", fullAdminOnly: true },
    ],
  },
  {
    title: "Tools",
    items: [
      { href: "/admin/content/landing-pages", label: "Landing Pages", icon: "image", fullAdminOnly: true },
      { href: "/admin/content/professional-events", label: "Specialist Events", icon: "network", fullAdminOnly: true },
      { href: "/admin/pathways", label: "Volunteer Pathways", icon: "pathways", fullAdminOnly: true },
      { href: "/admin/inventory/shirts", label: "Shirt Inventory", icon: "shirt", fullAdminOnly: true },
      { href: "/admin/points", label: "Points", icon: "points", fullAdminOnly: true },
      { href: "/admin/badges", label: "Badges", icon: "badges", fullAdminOnly: true },
    ],
  },
  {
    title: "System",
    items: [
      { href: "/admin/staff", label: "Staff Access", icon: "staff", adminOnly: true },
      {
        href: "https://voldatabasetool.vercel.app/",
        label: "MakLom",
        icon: "database",
        external: true,
        adminOnly: true,
      },
    ],
  },
];

function Icon({ name }: { name: IconName }) {
  const common = {
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };

  switch (name) {
    case "dashboard":
      return <svg {...common}><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></svg>;
    case "events":
      return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /><path d="m8.5 15 2 2 4-4" /></svg>;
    case "registrations":
      return <svg {...common}><path d="M9 5h10a2 2 0 0 1 2 2v12H9" /><path d="M5 3h4v18H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z" /><path d="M13 10h4M13 14h4" /></svg>;
    case "volunteers":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" /><path d="M16 7.5a2.5 2.5 0 1 1 0 5M17 15c2.3.5 4 2.5 4 5" /></svg>;
    case "reconciliation":
      return <svg {...common}><path d="M7 7h10M7 17h10" /><path d="m4 7 2-2 2 2M20 17l-2 2-2-2" /><path d="M6 5v8a4 4 0 0 0 4 4h6M18 19v-8a4 4 0 0 0-4-4H8" /></svg>;
    case "content":
      return <svg {...common}><path d="M4 4h16v16H4z" /><path d="M8 8h8M8 12h8M8 16h5" /></svg>;
    case "image":
      return <svg {...common}><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="8.5" cy="9" r="1.5" /><path d="m21 15-5-5L5 20" /></svg>;
    case "network":
      return <svg {...common}><circle cx="12" cy="5" r="2.5" /><circle cx="5" cy="18" r="2.5" /><circle cx="19" cy="18" r="2.5" /><path d="M10.8 7.2 6.2 15.8M13.2 7.2l4.6 8.6M7.5 18h9" /></svg>;
    case "pathways":
      return <svg {...common}><circle cx="6" cy="5" r="2" /><circle cx="18" cy="19" r="2" /><path d="M8 5h3a3 3 0 0 1 3 3v3a3 3 0 0 0 3 3h1" /><path d="M6 7v12h10" /></svg>;
    case "shirt":
      return <svg {...common}><path d="m8 4-5 3 3 4 2-1v10h8V10l2 1 3-4-5-3c-1 1.3-2.3 2-4 2S9 5.3 8 4Z" /></svg>;
    case "points":
      return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v10M9 10.5c0-1.4 1.3-2.5 3-2.5s3 1.1 3 2.5-1.3 2.5-3 2.5-3 1.1-3 2.5 1.3 2.5 3 2.5 3-1.1 3-2.5" /></svg>;
    case "badges":
      return <svg {...common}><circle cx="12" cy="9" r="6" /><path d="m8.5 14-1 7 4.5-2 4.5 2-1-7" /><path d="m12 6 1 2 2 .3-1.5 1.5.4 2.2-1.9-1-1.9 1 .4-2.2L9 8.3l2-.3 1-2Z" /></svg>;
    case "staff":
      return <svg {...common}><circle cx="9" cy="8" r="3" /><path d="M3 20c0-3.3 2.7-6 6-6 2.2 0 4.2 1.2 5.2 3" /><path d="M17 14v6M14 17h6" /></svg>;
    case "database":
      return <svg {...common}><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v7c0 1.7 3.6 3 8 3s8-1.3 8-3V5" /><path d="M4 12v7c0 1.7 3.6 3 8 3s8-1.3 8-3v-7" /></svg>;
    case "profile":
      return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21c.7-4.2 3.4-7 8-7s7.3 2.8 8 7" /></svg>;
    case "home":
      return <svg {...common}><path d="m3 11 9-8 9 8" /><path d="M5 10v11h14V10M9 21v-6h6v6" /></svg>;
  }
}

function isItemActive(pathname: string, item: NavItem) {
  if (item.external) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

function roleLabel(roles: readonly string[]) {
  if (roles.includes("admin")) return "Administrator";
  if (roles.includes("volteam")) return "Volunteer Team";
  if (roles.includes("staff")) return "Staff";
  if (roles.includes("volunteer_leader")) return "Volunteer Leader";
  return "Keluarga";
}

export function AdminShell({ children, roles, email }: AdminShellProps) {
  const pathname = usePathname();
  const isAdmin = roles.includes("admin");
  const hasFullAdmin = isAdmin || roles.includes("volteam");

  const groups = navGroups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.adminOnly && !isAdmin) return false;
        if (item.fullAdminOnly && !hasFullAdmin) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);

  const showBack = pathname !== "/admin" && hasFullAdmin;

  return (
    <div className={styles.shell}>
      <aside className={styles.sidebar}>
        <Link className={styles.brand} href={hasFullAdmin ? "/admin" : "/admin/events"}>
          <span className={styles.brandMark}>KM</span>
          <span className={styles.brandCopy}>
            <strong>Keluarga MENDAKI</strong>
            <span>Admin workspace</span>
          </span>
        </Link>

        <div className={styles.navigation}>
          {groups.map((group) => (
            <section className={styles.navGroup} key={group.title}>
              <h2>{group.title}</h2>
              <nav aria-label={group.title}>
                {group.items.map((item) => {
                  const active = isItemActive(pathname, item);
                  const content = (
                    <>
                      <span className={styles.navIcon}><Icon name={item.icon} /></span>
                      <span>{item.label}</span>
                      {item.external ? <span className={styles.externalMark}>↗</span> : null}
                    </>
                  );

                  return item.external ? (
                    <a
                      className={styles.navItem}
                      href={item.href}
                      key={item.href}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {content}
                    </a>
                  ) : (
                    <Link
                      className={`${styles.navItem} ${active ? styles.navItemActive : ""}`}
                      href={item.href}
                      key={item.href}
                    >
                      {content}
                    </Link>
                  );
                })}
              </nav>
            </section>
          ))}
        </div>

        <div className={styles.sidebarBottom}>
          <Link className={styles.utilityLink} href="/">
            <Icon name="home" />
            <span>Back to Keluarga</span>
          </Link>
          <Link className={styles.account} href="/dashboard">
            <span className={styles.avatar} aria-hidden="true">
              {(email?.trim().charAt(0) || "K").toUpperCase()}
            </span>
            <span className={styles.accountCopy}>
              <strong>{roleLabel(roles)}</strong>
              <span>{email ?? "My profile"}</span>
            </span>
            <Icon name="profile" />
          </Link>
        </div>
      </aside>

      <main className={styles.main}>
        {showBack ? (
          <div className={styles.backRow}>
            <Link href="/admin">← Back to dashboard</Link>
          </div>
        ) : null}
        <div className={styles.content}>{children}</div>
      </main>
    </div>
  );
}
