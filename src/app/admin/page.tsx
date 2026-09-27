import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const metadata: Metadata = {
  title: "Admin",
};

export const dynamic = "force-dynamic";

type AdminTool = Readonly<{
  href: string;
  title: string;
  description: string;
  external?: boolean;
  adminOnly?: boolean;
}>;

const tools: readonly AdminTool[] = [
  {
    href: "/admin/content",
    title: "Content & opportunities",
    description: "Manage opportunities, programme content and volunteer updates.",
  },
  {
    href: "/admin/content/landing-pages",
    title: "Landing page photos",
    description: "Upload and set hero photos for Home and the five volunteer landing pages.",
  },
  {
    href: "/admin/events",
    title: "Event Operations",
    description: "Manage events, rosters, attendance, QR check-in and event-day operations.",
  },
  {
    href: "/admin/registrations",
    title: "Volunteer registrations",
    description: "Review and manage volunteer registrations and waitlist states.",
  },
  {
    href: "/admin/volunteers",
    title: "Volunteer directory",
    description: "Search, filter and export volunteer profile data.",
  },
  {
    href: "/admin/inventory/shirts",
    title: "Shirt inventory",
    description: "Track round-neck and collared shirt stock and volunteer issuances.",
  },
  {
    href: "/admin/points",
    title: "Points management",
    description: "Manage audited volunteer recognition points.",
  },
  {
    href: "/admin/badges",
    title: "Badge management",
    description: "Manage badge definitions, awards and revocations.",
  },
  {
    href: "/admin/pathways",
    title: "Volunteer pathways",
    description: "Manage pathway maps, versions and reviewed volunteer positions.",
  },
  {
    href: "/admin/staff",
    title: "Staff access",
    description: "Invite staff and manage KELUARGA roles and permissions.",
    adminOnly: true,
  },
  {
    href: "https://voldatabasetool.vercel.app/",
    title: "MakLom",
    description: "Open the Volunteer Management workspace and longitudinal volunteer records.",
    external: true,
    adminOnly: true,
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

  const visibleTools = tools.filter((tool) => !tool.adminOnly || isAdmin);

  return (
    <div className="site-shell">
      <PortalHeader status="Admin" />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Admin</h1>
            <p className="muted">
              Management tools for KELUARGA operations, content, volunteers and recognition.
            </p>
          </div>
        </div>

        <section className="section" aria-label="Admin tools">
          <div className="card-grid">
            {visibleTools.map((tool) => {
              const body = (
                <>
                  <h2>{tool.title}</h2>
                  <p>{tool.description}</p>
                  <span className="text-link" aria-hidden="true">
                    Open {tool.external ? "↗" : "→"}
                  </span>
                </>
              );

              return tool.external ? (
                <a
                  className="card"
                  href={tool.href}
                  key={tool.href}
                  rel="noreferrer"
                >
                  {body}
                </a>
              ) : (
                <Link className="card" href={tool.href} key={tool.href}>
                  {body}
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
}
