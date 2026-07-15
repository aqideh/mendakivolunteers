import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";

export const metadata: Metadata = {
  title: "Content management",
};

export const dynamic = "force-dynamic";

type ContentAdminPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function readParameter(
  parameters: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

const successMessages: Record<string, string> = {
  opportunity_created: "Opportunity created.",
  opportunity_updated: "Opportunity updated.",
  news_created: "News post created.",
  news_updated: "News post updated.",
};

export default async function ContentAdminPage({
  searchParams,
}: ContentAdminPageProps) {
  const { supabase, access } = await requireContentManager({
    next: "/admin/content",
  });
  const parameters = await searchParams;
  const successCode = readParameter(parameters, "success");
  const errorMessage = readParameter(parameters, "error");
  const successMessage = successCode ? successMessages[successCode] : undefined;

  const [opportunitiesResult, newsResult] = await Promise.all([
    supabase
      .schema("content")
      .from("opportunities")
      .select("id, slug, title, status, starts_at, updated_at, featured")
      .order("updated_at", { ascending: false })
      .limit(100),
    supabase
      .schema("content")
      .from("news_posts")
      .select("id, slug, title, status, publish_at, published_at, updated_at, featured")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  const hasLoadError = Boolean(opportunitiesResult.error || newsResult.error);
  if (hasLoadError) {
    console.error("Unable to load CMS content", {
      opportunitiesCode: opportunitiesResult.error?.code,
      newsCode: newsResult.error?.code,
    });
    throw new Error("CMS content could not be loaded");
  }

  if (!opportunitiesResult.data || !newsResult.data) {
    throw new Error("CMS content query returned no result set");
  }

  const opportunities = opportunitiesResult.data;
  const newsPosts = newsResult.data;

  return (
    <div className="site-shell">
      <PortalHeader status="Content management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Native CMS</p>
            <h1>Manage volunteer content</h1>
            <p className="muted">
              Opportunities and news are owned by this portal. Opportunity
              registration remains a YM Hub link-out.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/content/news/new">
              New news post
            </Link>
            <Link
              className="button button-primary"
              href="/admin/content/opportunities/new"
            >
              New opportunity
            </Link>
          </div>
        </div>

        {successMessage ? (
          <div className="notice notice-success" role="status">
            {successMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="notice notice-error" role="alert">
            {errorMessage}
          </div>
        ) : null}
        <section className="section" aria-labelledby="opportunities-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Opportunity listings</p>
              <h2 id="opportunities-title">Opportunities</h2>
            </div>
            <Link className="text-link" href="/opportunities">
              View public listings
            </Link>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opportunity) => (
                  <tr key={opportunity.id}>
                    <td>
                      <strong>{opportunity.title}</strong>
                      <span className="table-subtext">/{opportunity.slug}</span>
                    </td>
                    <td>
                      <span className="status-pill">
                        {opportunity.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>{formatSingaporeDateTime(opportunity.starts_at)}</td>
                    <td>{formatSingaporeDateTime(opportunity.updated_at)}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/admin/content/opportunities/${opportunity.id}/edit`}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No opportunity records.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section" aria-labelledby="news-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">News feed</p>
              <h2 id="news-title">News posts</h2>
            </div>
            <Link className="text-link" href="/news">
              View public news
            </Link>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Published</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {newsPosts.map((post) => (
                  <tr key={post.id}>
                    <td>
                      <strong>{post.title}</strong>
                      <span className="table-subtext">/{post.slug}</span>
                    </td>
                    <td>
                      <span className="status-pill">
                        {post.status.replace("_", " ")}
                      </span>
                    </td>
                    <td>
                      {formatSingaporeDateTime(post.published_at ?? post.publish_at)}
                    </td>
                    <td>{formatSingaporeDateTime(post.updated_at)}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/admin/content/news/${post.id}/edit`}
                      >
                        Edit
                      </Link>
                    </td>
                  </tr>
                ))}
                {newsPosts.length === 0 ? (
                  <tr>
                    <td colSpan={5}>No news records.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section className="section panel" aria-labelledby="workflow-title">
          <p className="eyebrow">Publishing control</p>
          <h2 id="workflow-title">Role-based workflow</h2>
          <p>
            Editors can create drafts and submit content for review. Publishers
            and administrators can schedule, publish, and archive records.
            Database triggers record immutable revisions and status changes.
          </p>
          <p className="muted">
            Current access: {access.canPublish ? "Publisher" : "Editor"}
          </p>
        </section>
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal CMS</footer>
    </div>
  );
}
