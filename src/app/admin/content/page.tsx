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
import {
  getPackageListingStatus,
  sortTimeslots,
  type VolunteerTimeslot,
} from "@/lib/phaseone/packages";

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
  const canManageJourneys = hasEventManagerRole(access.roles);
  const phaseOneAdmin = canManageJourneys ? getPhaseOneAdminClient() : null;

  const [opportunitiesResult, newsResult, journeysResult, timeslotsResult] = await Promise.all([
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
    phaseOneAdmin
      ? phaseOneAdmin
          .from("phaseone_events")
          .select(
            "id, title, slug, reporting_at, venue, has_sign_in_pin, has_sign_out_pin, briefing_available_at, is_published, updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    phaseOneAdmin
      ? phaseOneAdmin
          .from("phaseone_event_timeslots")
          .select("id, event_id, label, starts_at, ends_at, status, sort_order")
          .order("starts_at", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasLoadError = Boolean(
    opportunitiesResult.error ||
      newsResult.error ||
      journeysResult.error ||
      timeslotsResult.error,
  );
  if (hasLoadError) {
    console.error("Unable to load CMS content", {
      opportunitiesCode: opportunitiesResult.error?.code,
      newsCode: newsResult.error?.code,
      journeysCode: journeysResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
    });
    throw new Error("CMS content could not be loaded");
  }

  if (
    !opportunitiesResult.data ||
    !newsResult.data ||
    !journeysResult.data ||
    !timeslotsResult.data
  ) {
    throw new Error("CMS content query returned no result set");
  }

  const opportunities = opportunitiesResult.data;
  const newsPosts = newsResult.data;
  const timeslotsByEvent = new Map<string, VolunteerTimeslot[]>();
  for (const timeslot of timeslotsResult.data) {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot as VolunteerTimeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  }
  const allJourneys = journeysResult.data.map((journey) => ({
    ...journey,
    timeslots: sortTimeslots(timeslotsByEvent.get(journey.id) ?? []),
  })) as AdminEventSummary[];
  const { current: currentJourneys, past: pastJourneys } = splitAdminEvents(allJourneys);
  const journeys = sortCurrentAdminEvents(currentJourneys);

  return (
    <div className="site-shell">
      <PortalHeader status="Content management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Native CMS</p>
            <h1>Manage volunteer content</h1>
            <p className="muted">
              Manage event guides and news here. Opportunity listings remain visible,
              but creation and editing are temporarily paused.
            </p>
          </div>
          <div className="actions">
            {canManageJourneys ? (
              <Link className="button button-primary" href="/admin/events/new">
                New event guide
              </Link>
            ) : null}
            <Link className="button button-secondary" href="/admin/content/news/new">
              New news post
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

        {canManageJourneys ? (
          <section className="section" aria-labelledby="journeys-title">
            <div className="section-header">
              <div>
                <p className="eyebrow">Volunteer operations</p>
                <h2 id="journeys-title">Event guides</h2>
              </div>
              <div className="actions">
                <Link className="text-link" href="/admin/events/past">
                  Past events ({pastJourneys.length})
                </Link>
                <Link className="text-link" href="/journey">
                  View public journeys
                </Link>
              </div>
            </div>
            <div className="table-wrap">
              <table className="content-table">
                <thead>
                  <tr>
                    <th scope="col">Event guide</th>
                    <th scope="col">Reporting</th>
                    <th scope="col">Access</th>
                    <th scope="col">Visibility</th>
                    <th scope="col">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {journeys.map((journey) => {
                    const firstTimeslot = getAdminEventFirstScheduledTimeslot(journey);
                    return (
                      <tr key={journey.id}>
                        <td>
                          <strong>{journey.title}</strong>
                          <span className="table-subtext">
                            /journey/{journey.slug}
                          </span>
                        </td>
                        <td>
                          {firstTimeslot
                            ? formatSingaporeDateTime(firstTimeslot.starts_at)
                            : journey.reporting_at
                              ? formatSingaporeDateTime(journey.reporting_at)
                              : "Not set"}
                        </td>
                        <td>
                          {journey.has_sign_in_pin && journey.has_sign_out_pin
                            ? "Both PINs configured"
                            : "Configuration incomplete"}
                        </td>
                        <td>
                          <span className="status-pill">
                            {getPackageListingStatus(
                              journey.timeslots.length > 0 ? journey.timeslots : journey.reporting_at,
                              journey.is_published,
                            )}
                          </span>
                        </td>
                        <td>
                          <div className="actions">
                            <Link
                              className="text-link"
                              href={`/admin/events/${journey.id}/edit`}
                            >
                              Edit
                            </Link>
                            {journey.is_published ? (
                              <Link
                                className="text-link"
                                href={`/journey/${journey.slug}`}
                                target="_blank"
                              >
                                View
                              </Link>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                  {journeys.length === 0 ? (
                    <tr>
                      <td colSpan={5}>No current or recent event guides.</td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </section>
        ) : null}

        <section className="section" aria-labelledby="opportunities-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Read-only listings</p>
              <h2 id="opportunities-title">Opportunities</h2>
            </div>
            <Link className="text-link" href="/opportunities">
              View public listings
            </Link>
          </div>
          <div className="notice" role="status">
            Opportunity creation and editing are temporarily paused.
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Title</th>
                  <th scope="col">Status</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Updated</th>
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
                  </tr>
                ))}
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={4}>No opportunity records.</td>
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
            Event-guide access is limited to attendance managers and administrators.
            News editors can create drafts, while publishers and administrators can
            schedule and publish posts.
          </p>
          <p className="muted">
            Current news access: {access.canPublish ? "Publisher" : "Editor"}
          </p>
        </section>
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal CMS</footer>
    </div>
  );
}
