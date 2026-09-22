import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { hasEventManagerRole } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import {
  getAdminEventFirstScheduledTimeslot,
  sortCurrentAdminEvents,
  splitAdminEvents,
  type AdminEventSummary,
} from "@/lib/phaseone/admin-events";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { sortTimeslots, type VolunteerTimeslot } from "@/lib/phaseone/packages";
import styles from "./page.module.css";

export const metadata: Metadata = { title: "Content management" };
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
  news_created: "News post created.",
  news_updated: "News post updated.",
};

export default async function ContentAdminPage({ searchParams }: ContentAdminPageProps) {
  const { supabase, access } = await requireContentManager({ next: "/admin/content" });
  const parameters = await searchParams;
  const successCode = readParameter(parameters, "success");
  const errorMessage = readParameter(parameters, "error");
  const successMessage = successCode ? successMessages[successCode] : undefined;
  const canManageProgrammes = hasEventManagerRole(access.roles);
  const admin = getPhaseOneAdminClient();

  const [programmesResult, timeslotsResult, newsResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select(
        "id, title, slug, reporting_at, venue, has_sign_in_pin, has_sign_out_pin, briefing_available_at, is_published, is_opportunity_published, opportunity_summary, updated_at",
      )
      .order("updated_at", { ascending: false })
      .limit(2000),
    admin
      .from("phaseone_event_timeslots")
      .select("id, event_id, label, starts_at, ends_at, status, sort_order")
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(20000),
    supabase
      .schema("content")
      .from("news_posts")
      .select("id, slug, title, status, publish_at, published_at, updated_at, featured")
      .order("updated_at", { ascending: false })
      .limit(100),
  ]);

  if (
    programmesResult.error ||
    timeslotsResult.error ||
    newsResult.error ||
    !programmesResult.data ||
    !timeslotsResult.data ||
    !newsResult.data
  ) {
    console.error("Unable to load CMS content", {
      programmesCode: programmesResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
      newsCode: newsResult.error?.code,
    });
    throw new Error("CMS content could not be loaded");
  }

  const timeslotsByEvent = new Map<string, VolunteerTimeslot[]>();
  for (const timeslot of timeslotsResult.data) {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot as VolunteerTimeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  }

  const allProgrammes = programmesResult.data.map((programme) => ({
    ...programme,
    timeslots: sortTimeslots(timeslotsByEvent.get(programme.id) ?? []),
  })) as AdminEventSummary[];
  const { current, past } = splitAdminEvents(allProgrammes);
  const programmes = sortCurrentAdminEvents(current);
  const newsPosts = newsResult.data;

  return (
    <div className="site-shell">
      <PortalHeader status="Content management" dashboard />
      <main className={`page-frame ${styles.page}`}>
        <div className={`dashboard-header ${styles.header}`}>
          <div className={styles.headerCopy}>
            <h1>Manage volunteer content</h1>
            <p className={`muted ${styles.description}`}>
              Programme records now drive the public opportunity listing, Event Guides
              and Event Operations. News remains a separate content stream.
            </p>
          </div>
          <div className={`actions ${styles.actions}`}>
            {canManageProgrammes ? (
              <Link className="button button-primary" href="/admin/events/new">
                New programme
              </Link>
            ) : null}
            <Link className="button button-secondary" href="/admin/content/news/new">
              New news post
            </Link>
          </div>
        </div>

        <nav className={styles.sectionIndex} aria-label="Content sections">
          <a className={styles.sectionLink} href="#programmes">
            <span>Programmes</span>
            <span className={styles.sectionCount}>{programmes.length}</span>
          </a>
          <a className={styles.sectionLink} href="#news-posts">
            <span>News posts</span>
            <span className={styles.sectionCount}>{newsPosts.length}</span>
          </a>
        </nav>

        {successMessage ? <div className="notice notice-success" role="status">{successMessage}</div> : null}
        {errorMessage ? <div className="notice notice-error" role="alert">{errorMessage}</div> : null}

        <section id="programmes" className={`section ${styles.section}`} aria-labelledby="programmes-title">
          <div className={`section-header ${styles.sectionHeader}`}>
            <div>
              <h2 id="programmes-title">Programmes & opportunities</h2>
              <p className={styles.sectionMeta}>
                {programmes.length} current · {past.length} past · one record per programme/event
              </p>
            </div>
            <div className="actions">
              <Link className="text-link" href="/opportunities">View opportunities</Link>
              {canManageProgrammes ? <Link className="text-link" href="/admin/events">Event Operations</Link> : null}
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Programme</th>
                  <th scope="col">Schedule</th>
                  <th scope="col">Opportunity</th>
                  <th scope="col">Event Guide</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {programmes.map((programme) => {
                  const first = getAdminEventFirstScheduledTimeslot(programme);
                  return (
                    <tr key={programme.id}>
                      <td>
                        <strong>{programme.title}</strong>
                        <span className="table-subtext">/journey/{programme.slug}</span>
                      </td>
                      <td>{first ? formatSingaporeDateTime(first.starts_at) : "Not set"}</td>
                      <td>
                        <span className="status-pill">
                          {programme.is_opportunity_published ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td>
                        <span className="status-pill">
                          {programme.is_published ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td>
                        {canManageProgrammes ? (
                          <Link className="text-link" href={`/admin/events/${programme.id}/edit`}>
                            Edit programme
                          </Link>
                        ) : (
                          <span className="table-subtext">Event manager access required</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
                {programmes.length === 0 ? (
                  <tr><td colSpan={5}>No current programmes.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section id="news-posts" className={`section ${styles.section}`} aria-labelledby="news-title">
          <div className={`section-header ${styles.sectionHeader}`}>
            <div>
              <h2 id="news-title">News posts</h2>
              <p className={styles.sectionMeta}>
                {newsPosts.length} posts · {access.canPublish ? "Publisher access" : "Editor access"}
              </p>
            </div>
            <Link className="text-link" href="/news">View public news</Link>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr><th>Title</th><th>Status</th><th>Published</th><th>Updated</th><th>Action</th></tr>
              </thead>
              <tbody>
                {newsPosts.map((post) => (
                  <tr key={post.id}>
                    <td><strong>{post.title}</strong><span className="table-subtext">/{post.slug}</span></td>
                    <td><span className="status-pill">{post.status.replace("_", " ")}</span></td>
                    <td>{formatSingaporeDateTime(post.published_at ?? post.publish_at)}</td>
                    <td>{formatSingaporeDateTime(post.updated_at)}</td>
                    <td>
                      <Link className="text-link" href={`/admin/content/news/${post.id}/edit`}>Edit</Link>
                    </td>
                  </tr>
                ))}
                {newsPosts.length === 0 ? <tr><td colSpan={5}>No news records.</td></tr> : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal CMS</footer>
    </div>
  );
}
