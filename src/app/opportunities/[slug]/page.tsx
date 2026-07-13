import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
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
  const { data } = await supabase
    .schema("content")
    .from("opportunities")
    .select("title, summary")
    .eq("slug", slug)
    .maybeSingle();

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
                {opportunity.is_remote
                  ? "Online"
                  : opportunity.location_name ?? "To be confirmed"}
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
            <h2>Registration is managed in YM Hub</h2>
            <p>
              This portal lists the opportunity but does not create or manage
              your registration. The link opens the official YM Hub registration
              destination.
            </p>
            <a
              className="button button-primary"
              href={opportunity.registration_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Register on YM Hub
            </a>
          </aside>
        </article>
      </main>
      <footer className="site-footer">
        Official registration status remains in YM Hub.
      </footer>
    </div>
  );
}
