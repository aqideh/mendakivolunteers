import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireAdmin } from "@/lib/auth/staff-access";

export const metadata: Metadata = {
  title: "Administration",
};

export const dynamic = "force-dynamic";

const adminTools = [
  {
    href: "/admin/content",
    title: "Content",
    description: "Manage opportunity listings, Event Guides and news content.",
  },
  {
    href: "/admin/recruitment",
    title: "Volunteer recruitment",
    description: "Review prospective volunteer submissions and recruitment status.",
  },
  {
    href: "/admin/events",
    title: "Event operations",
    description: "Manage event rosters, attendance and on-site operations.",
  },
  {
    href: "/admin/points",
    title: "Points",
    description: "Award and review audited volunteer recognition points.",
  },
  {
    href: "/admin/badges",
    title: "Badges",
    description: "Manage badge definitions and volunteer badge awards.",
  },
  {
    href: "/admin/pathways",
    title: "Volunteer pathways",
    description: "Edit and publish the volunteer pathway map.",
  },
  {
    href: "/admin/pathways/positions",
    title: "Pathway positions",
    description: "Manage confirmed volunteer positions across pathway tracks.",
  },
  {
    href: "/admin/staff",
    title: "Staff access",
    description: "Invite staff, assign access and resend account setup emails.",
  },
] as const;

export default async function AdminPage() {
  await requireAdmin("/admin");

  return (
    <div className="site-shell">
      <PortalHeader status="Administration" dashboard />
      <main className="page-frame compact-page">
        <div className="dashboard-header compact-dashboard-header">
          <div>
            <p className="eyebrow">Administration</p>
            <h1>Admin</h1>
            <p className="muted compact-dashboard-description">
              Central access to KELUARGA staff administration and operational tools.
            </p>
          </div>
          <div className="actions compact-top-actions">
            <Link className="button button-secondary" href="/dashboard">
              Back to My Profile
            </Link>
          </div>
        </div>

        <section className="compact-section" aria-labelledby="admin-tools-title">
          <div className="section-header compact-section-header">
            <div>
              <h2 id="admin-tools-title">Admin tools</h2>
              <p className="compact-section-meta">
                Access remains role-gated on each destination.
              </p>
            </div>
          </div>

          <div className="flat-link-list">
            {adminTools.map((tool) => (
              <Link className="flat-link-row" href={tool.href} key={tool.href}>
                <span className="flat-link-row-copy">
                  <strong>{tool.title}</strong>
                  <span>{tool.description}</span>
                </span>
                <span className="flat-link-row-action">Open</span>
              </Link>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}
