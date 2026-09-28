import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

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
  title: string;
  description: string;
  tools: readonly AdminTool[];
}>;

const groups: readonly AdminGroup[] = [
  {
    title: "Operations",
    description: "Run programmes, manage registrations and support event-day delivery.",
    tools: [
      {
        href: "/admin/events",
        title: "Event Operations",
        description: "Programmes, rosters, attendance, QR check-in and event-day operations.",
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
        description: "Track shirt stock and volunteer issuances.",
        icon: "SH",
      },
    ],
  },
  {
    title: "People",
    description: "Work with volunteer records, pathways and staff access.",
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
        description: "Manage pathway maps and reviewed volunteer positions.",
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
    title: "Content",
    description: "Manage public-facing opportunities, landing pages and specialist events.",
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
        description: "Upload and set hero photos across Keluarga landing pages.",
        icon: "LP",
      },
      {
        href: "/admin/content/professional-events",
        title: "Specialist events",
        description: "Manage Professional Network event cards separately from volunteering.",
        icon: "SE",
      },
    ],
  },
  {
    title: "Recognition & data",
    description: "Manage recognition systems and access longitudinal volunteer records.",
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
        description: "Open the Volunteer Management workspace and longitudinal records.",
        icon: "ML",
        external: true,
        adminOnly: true,
      },
    ],
  },
];

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

  return (
    <main className={`page-frame ${styles.page}`}>
      <header className={styles.header}>
        <div>
          <h1>Admin dashboard</h1>
          <p>
            Manage Keluarga operations, volunteers, content and recognition from one workspace.
          </p>
        </div>
      </header>

      <section className={styles.primarySection} aria-labelledby="primary-title">
        <div className={styles.sectionHeading}>
          <div>
            <h2 id="primary-title">Start here</h2>
            <p>Your most common operational workflows.</p>
          </div>
        </div>

        <div className={styles.primaryGrid}>
          <Link href="/admin/events" className={styles.primaryCard}>
            <div className={styles.cardIcon}>EV</div>
            <div>
              <h3>Event Operations</h3>
              <p>Run programmes, rosters, attendance and event-day operations.</p>
            </div>
            <span aria-hidden="true">→</span>
          </Link>

          <Link href="/admin/registrations" className={styles.primaryCard}>
            <div className={styles.cardIcon}>RG</div>
            <div>
              <h3>Volunteer registrations</h3>
              <p>Review registrations, allocations and waitlists.</p>
            </div>
            <span aria-hidden="true">→</span>
          </Link>
        </div>
      </section>

      <div className={styles.groupStack}>
        {visibleGroups.map((group) => (
          <section className={styles.group} key={group.title}>
            <div className={styles.sectionHeading}>
              <div>
                <h2>{group.title}</h2>
                <p>{group.description}</p>
              </div>
            </div>

            <div className={styles.toolGrid}>
              {group.tools.map((tool) => {
                const body = (
                  <>
                    <div className={styles.cardIcon}>{tool.icon}</div>
                    <div className={styles.toolCopy}>
                      <h3>{tool.title}</h3>
                      <p>{tool.description}</p>
                    </div>
                    <span className={styles.arrow} aria-hidden="true">
                      {tool.external ? "↗" : "→"}
                    </span>
                  </>
                );

                return tool.external ? (
                  <a
                    className={styles.toolCard}
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
    </main>
  );
}
