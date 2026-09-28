import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

import styles from "./admin.module.css";

export const metadata: Metadata = {
  title: "Admin",
};

export const dynamic = "force-dynamic";

type AdminTool = Readonly<{
  href: string;
  title: string;
  description: string;
  icon: string;
  external?: boolean;
  adminOnly?: boolean;
}>;

type AdminGroup = Readonly<{
  id: string;
  title: string;
  note: string;
  tools: readonly AdminTool[];
}>;

const groups: readonly AdminGroup[] = [
  {
    id: "operations",
    title: "Operations",
    note: "Run activities and registrations",
    tools: [
      {
        href: "/admin/events",
        title: "Event Operations",
        description: "Manage events, rosters, attendance, QR check-in and event-day operations.",
        icon: "EV",
      },
      {
        href: "/admin/registrations",
        title: "Volunteer registrations",
        description: "Review registrations, allocations and waitlist states.",
        icon: "RG",
      },
      {
        href: "/admin/inventory/shirts",
        title: "Shirt inventory",
        description: "Track round-neck and collared shirt stock and volunteer issuances.",
        icon: "SH",
      },
    ],
  },
  {
    id: "people",
    title: "People",
    note: "Manage volunteers and access",
    tools: [
      {
        href: "/admin/volunteers",
        title: "Volunteer directory",
        description: "Search, filter and export volunteer profile data.",
        icon: "VD",
      },
      {
        href: "/admin/pathways",
        title: "Volunteer pathways",
        description: "Manage pathway maps, versions and reviewed volunteer positions.",
        icon: "VP",
      },
      {
        href: "/admin/staff",
        title: "Staff access",
        description: "Invite staff and manage KELUARGA roles and permissions.",
        icon: "SA",
        adminOnly: true,
      },
    ],
  },
  {
    id: "content",
    title: "Content",
    note: "Manage public-facing content",
    tools: [
      {
        href: "/admin/content",
        title: "Content & opportunities",
        description: "Manage opportunities, programme content and volunteer updates.",
        icon: "CO",
      },
      {
        href: "/admin/content/landing-pages",
        title: "Landing page photos",
        description: "Upload and set hero photos for Home and the five volunteer landing pages.",
        icon: "LP",
      },
      {
        href: "/admin/content/professional-events",
        title: "Specialist events",
        description: "Manage Professional Network event cards separately from volunteer opportunities.",
        icon: "SE",
      },
    ],
  },
  {
    id: "recognition",
    title: "Recognition",
    note: "Shape and recognise volunteer contribution",
    tools: [
      {
        href: "/admin/points",
        title: "Points management",
        description: "Manage audited volunteer recognition points.",
        icon: "PT",
      },
      {
        href: "/admin/badges",
        title: "Badge management",
        description: "Manage badge definitions, awards and revocations.",
        icon: "BD",
      },
      {
        href: "https://voldatabasetool.vercel.app/",
        title: "MakLom",
        description: "Open the Volunteer Management workspace and longitudinal volunteer records.",
        icon: "ML",
        external: true,
        adminOnly: true,
      },
    ],
  },
];

function ToolIcon({ label }: { label: string }) {
  return <span aria-hidden="true">{label}</span>;
}

export default async function AdminPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login?next=%2Fadmin");
  }

  const [accountResult, rolesResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  if (accountResult.error || rolesResult.error) {
    throw new Error("Admin access could not be verified");
  }

  const roles = (rolesResult.data ?? []).map(({ role }) => role as AppRole);
  const isAdmin = roles.includes("admin");
  const canAccessAdmin = isAdmin || roles.includes("volteam");

  if (accountResult.data?.status !== "active" || !canAccessAdmin) {
    redirect("/dashboard");
  }

  const visibleGroups = groups.map((group) => ({
    ...group,
    tools: group.tools.filter((tool) => !tool.adminOnly || isAdmin),
  }));

  const eventTool = visibleGroups[0]?.tools.find((tool) => tool.href === "/admin/events");
  const registrationTool = visibleGroups[0]?.tools.find(
    (tool) => tool.href === "/admin/registrations",
  );
  const volunteerTool = visibleGroups[1]?.tools.find((tool) => tool.href === "/admin/volunteers");

  return (
    <div className="site-shell">
      <PortalHeader status="Admin" />
      <main className={`page-frame ${styles.page}`}>
        <div className={styles.workspace}>
          <aside className={styles.rail} aria-label="Admin sections">
            <Link href="/admin" className={styles.railMark} aria-label="Admin home">
              KM
            </Link>

            <nav className={styles.railNav}>
              {visibleGroups.map((group, index) => (
                <a
                  key={group.id}
                  className={`${styles.railLink} ${index === 0 ? styles.railLinkActive : ""}`}
                  href={`#${group.id}`}
                  aria-label={group.title}
                  title={group.title}
                >
                  {group.title.slice(0, 2).toUpperCase()}
                </a>
              ))}
            </nav>

            <div className={styles.railSpacer} />

            <Link href="/" className={styles.railHome} aria-label="Back to Keluarga MENDAKI">
              ↗
            </Link>
          </aside>

          <section className={styles.surface}>
            <header className={styles.topbar}>
              <div>
                <span className={styles.kicker}>Keluarga workspace</span>
                <h1>Admin</h1>
                <p>
                  Manage operations, volunteers, public content and recognition from one workspace.
                </p>
              </div>
              <div className={styles.rolePill}>
                <span className={styles.roleDot} aria-hidden="true" />
                {isAdmin ? "Administrator" : "Volunteer Team"}
              </div>
            </header>

            <section className={styles.priorityGrid} aria-label="Priority tools">
              {eventTool ? (
                <Link href={eventTool.href} className={styles.featureCard}>
                  <div className={styles.featureIcon}>
                    <ToolIcon label={eventTool.icon} />
                  </div>
                  <h2>{eventTool.title}</h2>
                  <p>{eventTool.description}</p>
                  <span className={styles.featureAction}>
                    Open workspace <span aria-hidden="true">→</span>
                  </span>
                </Link>
              ) : null}

              <div className={styles.quickStack}>
                {registrationTool ? (
                  <Link href={registrationTool.href} className={styles.quickCard}>
                    <div className={styles.quickIcon}>
                      <ToolIcon label={registrationTool.icon} />
                    </div>
                    <div className={styles.quickCopy}>
                      <strong>{registrationTool.title}</strong>
                      <span>Review active registrations and waitlists.</span>
                    </div>
                    <span className={styles.arrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                ) : null}

                {volunteerTool ? (
                  <Link href={volunteerTool.href} className={styles.quickCard}>
                    <div className={styles.quickIcon}>
                      <ToolIcon label={volunteerTool.icon} />
                    </div>
                    <div className={styles.quickCopy}>
                      <strong>{volunteerTool.title}</strong>
                      <span>Find profiles and manage volunteer records.</span>
                    </div>
                    <span className={styles.arrow} aria-hidden="true">
                      →
                    </span>
                  </Link>
                ) : null}
              </div>
            </section>

            <div className={styles.groupStack}>
              {visibleGroups.map((group) => (
                <section className={styles.group} id={group.id} key={group.id}>
                  <div className={styles.groupHeader}>
                    <h2>{group.title}</h2>
                    <span>{group.note}</span>
                  </div>

                  <div className={styles.toolGrid}>
                    {group.tools.map((tool) => {
                      const body = (
                        <>
                          <div className={styles.toolIcon}>
                            <ToolIcon label={tool.icon} />
                          </div>
                          <div className={styles.toolCopy}>
                            <h3>{tool.title}</h3>
                            <p>{tool.description}</p>
                          </div>
                          <span className={styles.toolArrow} aria-hidden="true">
                            {tool.external ? "↗" : "→"}
                          </span>
                        </>
                      );

                      return tool.external ? (
                        <a
                          className={`${styles.toolCard} ${styles.externalCard}`}
                          href={tool.href}
                          key={tool.href}
                          rel="noreferrer"
                          target="_blank"
                        >
                          {body}
                        </a>
                      ) : (
                        <Link className={styles.toolCard} href={tool.href} key={tool.href}>
                          {body}
                        </Link>
                      );
                    })}
                  </div>
                </section>
              ))}
            </div>
          </section>
        </div>
      </main>
    </div>
  );
}
