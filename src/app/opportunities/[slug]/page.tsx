import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getOpportunityLocation } from "@/lib/content/validation";
import { createClient } from "@/lib/supabase/server";

type OpportunityPageProps = {
  params: Promise<{ slug: string }>;
};

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: OpportunityPageProps): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("content")
    .from("opportunities")
    .select("title, summary")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load opportunity metadata", { code: error.code, slug });
    throw new Error("Opportunity metadata could not be loaded");
  }

  return data
    ? { title: data.title, description: data.summary }
    : { title: "Opportunity not found" };
}

export default async function OpportunityPage({ params }: OpportunityPageProps) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: opportunity, error } = await supabase
    .schema("content")
    .from("opportunities")
    .select(
      "id, title, summary, body, category, location_name, is_remote, starts_at, ends_at, registration_deadline, registration_url, featured",
    )
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load opportunity", { code: error.code, slug });
    throw new Error("Opportunity details could not be loaded");
  }

  if (!opportunity) {
    notFound();
  }

  const bodyParagraphs = opportunity.body
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  return (
    <div className="site-shell">
      <PortalHeader status="Opportunity details" />
      <main className="page-frame narrow-frame">
        <Link className="back-link" href="/opportunities">
          ← All opportunities
        </Link>
        <article className="content-detail">
          <div className="content-card-meta">
            <span className="tag">{opportunity.category}</span>
            {opportunity.featured ? (
              <span className="tag tag-accent">Featured</span>
            ) : null}
          </div>
          <h1>{opportunity.title}</h1>
          <p className="lede">{opportunity.summary}</p>

          <dl className="detail-list">
            <div>
              <dt>Starts</dt>
              <dd>{formatSingaporeDateTime(opportunity.starts_at)}</dd>
            </div>
            <div>
              <dt>Ends</dt>
              <dd>{formatSingaporeDateTime(opportunity.ends_at)}</dd>
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
            <div>
              <dt>Registration deadline</dt>
              <dd>
                {formatSingaporeDateTime(opportunity.registration_deadline)}
              </dd>
            </div>
          </dl>

          <div className="prose-block">
            {bodyParagraphs.map((paragraph) => (
              <p key={paragraph}>{paragraph}</p>
            ))}
          </div>

          <aside className="panel source-boundary">
            <h2>Registration transition</h2>
            <p>
              KELUARGA is becoming MENDAKI&apos;s volunteer-facing registration channel.
              This opportunity still uses a linked registration destination while
              the in-app registration workflow is being implemented.
            </p>
            <p className="muted">
              Once the transition is complete, registrations will be recorded in
              KELUARGA and passed directly into event operations.
            </p>
            <a
              className="button button-primary"
              href={opportunity.registration_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Continue to registration
            </a>
          </aside>
        </article>
      </main>
      <footer className="site-footer">
        <span>Keluarga MENDAKI is the target volunteer-facing recruitment and registration channel. Linked registration destinations are transitional.</span>
        <span className="site-footer-copyright">
          © 2026{" "}
          <a href="https://www.mendaki.org.sg/" target="_blank" rel="noreferrer">
            Yayasan MENDAKI
          </a>
        </span>
      </footer>
    </div>
  );
}
