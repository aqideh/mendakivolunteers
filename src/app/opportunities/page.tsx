import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getOpportunityLocation } from "@/lib/content/validation";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "Volunteer opportunities",
  description: "Browse app-managed MENDAKI volunteer opportunity listings.",
};

export const dynamic = "force-dynamic";

export default async function OpportunitiesPage() {
  const supabase = await createClient();
  const { data: opportunities, error } = await supabase
    .schema("content")
    .from("opportunities")
    .select(
      "id, slug, title, summary, category, location_name, is_remote, starts_at, ends_at, registration_deadline, featured",
    )
    .gte("starts_at", new Date().toISOString())
    .order("featured", { ascending: false })
    .order("starts_at", { ascending: true })
    .limit(100);

  if (error) {
    console.error("Unable to load public opportunities", { code: error.code });
    throw new Error("Public opportunities could not be loaded");
  }

  return (
    <div className="site-shell">
      <PortalHeader status="Opportunity discovery" />
      <main className="page-frame">
        <section className="page-intro">
          <p className="eyebrow">Volunteer opportunities</p>
          <h1>Find a way to contribute.</h1>
          <p className="lede">
            These listings are managed in this portal. Registration and
            confirmation remain in YM Hub.
          </p>
        </section>

        {opportunities.length > 0 ? (
          <section className="content-grid" aria-label="Available opportunities">
            {opportunities.map((opportunity) => (
              <article
                className={`content-card${opportunity.featured ? " content-card-featured" : ""}`}
                key={opportunity.id}
              >
                <div className="content-card-meta">
                  <span className="tag">{opportunity.category}</span>
                  {opportunity.featured ? (
                    <span className="tag tag-accent">Featured</span>
                  ) : null}
                </div>
                <h2>
                  <Link href={`/opportunities/${opportunity.slug}`}>
                    {opportunity.title}
                  </Link>
                </h2>
                <p>{opportunity.summary}</p>
                <dl className="compact-details">
                  <div>
                    <dt>Date</dt>
                    <dd>{formatSingaporeDateTime(opportunity.starts_at)}</dd>
                  </div>
                  <div>
                    <dt>Location</dt>
                    <dd>
                      {getOpportunityLocation(
                        opportunity.is_remote,
                        opportunity.location_name,
                      )}
                    </dd>
                  </div>
                </dl>
                <Link
                  className="text-link"
                  href={`/opportunities/${opportunity.slug}`}
                >
                  View opportunity
                </Link>
              </article>
            ))}
          </section>
        ) : (
          <section className="panel empty-state">
            <h2>No upcoming opportunities are listed.</h2>
            <p className="muted">Check again when new listings are published.</p>
          </section>
        )}
      </main>
      <footer className="site-footer">
        Registration records and confirmations are managed in YM Hub.
      </footer>
    </div>
  );
}
