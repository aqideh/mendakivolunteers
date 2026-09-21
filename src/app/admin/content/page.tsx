import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { hasEventManagerRole } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  getAdminEventFirstScheduledTimeslot,
  sortCurrentAdminEvents,
  splitAdminEvents,
  type AdminEventSummary,
} from "@/lib/phaseone/admin-events";
import {
  getPackageListingStatus,
  sortTimeslots,
  type VolunteerTimeslot,
} from "@/lib/phaseone/packages";
import styles from "./page.module.css";

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
  opportunity_override_saved: "Opportunity card updated.",
  opportunity_override_reset: "Opportunity card reset to imported values.",
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
  const phaseOneAdmin = getPhaseOneAdminClient();

  const [
    opportunitySourcesResult,
    opportunityOverridesResult,
    newsResult,
    journeysResult,
    timeslotsResult,
  ] = await Promise.all([
    phaseOneAdmin
      .from("phaseone_external_opportunities")
      .select("id, title, starts_at, imported_at, is_active")
      .eq("is_active", true)
      .order("starts_at", { ascending: false, nullsFirst: false })
      .limit(100),
    phaseOneAdmin
      .from("phaseone_opportunity_overrides")
      .select(
        "opportunity_id, title, starts_at, is_hidden, sort_order, updated_at",
      )
      .limit(100),
    supabase
      .schema("content")
      .from("news_posts")
      .select("id, slug, title, status, publish_at, published_at, updated_at, featured")
      .order("updated_at", { ascending: false })
      .limit(100),
    canManageJourneys
      ? phaseOneAdmin
          .from("phaseone_events")
          .select(
            "id, title, slug, reporting_at, venue, has_sign_in_pin, has_sign_out_pin, briefing_available_at, is_published, updated_at",
          )
          .order("updated_at", { ascending: false })
          .limit(2000)
      : Promise.resolve({ data: [], error: null }),
    canManageJourneys
      ? phaseOneAdmin
          .from("phaseone_event_timeslots")
          .select("id, event_id, label, starts_at, ends_at, status, sort_order")
          .order("starts_at", { ascending: true })
          .order("sort_order", { ascending: true })
          .limit(20000)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const hasLoadError = Boolean(
    opportunitySourcesResult.error ||
      opportunityOverridesResult.error ||
      newsResult.error ||
      journeysResult.error ||
      timeslotsResult.error,
  );
  if (hasLoadError) {
    console.error("Unable to load CMS content", {
      opportunitySourcesCode: opportunitySourcesResult.error?.code,
      opportunityOverridesCode: opportunityOverridesResult.error?.code,
      newsCode: newsResult.error?.code,
      journeysCode: journeysResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
    });
    throw new Error("CMS content could not be loaded");
  }

  if (
    !opportunitySourcesResult.data ||
    !opportunityOverridesResult.data ||
    !newsResult.data ||
    !journeysResult.data ||
    !timeslotsResult.data
  ) {
    throw new Error("CMS content query returned no result set");
  }

  const overrideByOpportunity = new Map(
    opportunityOverridesResult.data.map((override) => [
      override.opportunity_id,
      override,
    ]),
  );
  const opportunities = opportunitySourcesResult.data
    .map((source) => {
      const override = overrideByOpportunity.get(source.id);
      return {
        id: source.id,
        importedTitle: source.title,
        title: override?.title ?? source.title,
        startsAt: override ? override.starts_at : source.starts_at,
        isHidden: override?.is_hidden ?? false,
        sortOrder: override?.sort_order ?? null,
        updatedAt: override?.updated_at ?? source.imported_at,
        hasOverride: Boolean(override),
      };
    })
    .sort((left, right) => {
      if (left.sortOrder !== null || right.sortOrder !== null) {
        if (left.sortOrder === null) return 1;
        if (right.sortOrder === null) return -1;
        if (left.sortOrder !== right.sortOrder) return left.sortOrder - right.sortOrder;
      }

      const leftTime = left.startsAt ? new Date(left.startsAt).getTime() : 0;
      const rightTime = right.startsAt ? new Date(right.startsAt).getTime() : 0;
      return rightTime - leftTime;
    });

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
      <main className={`page-frame ${styles.page}`}>
        <div className={`dashboard-header ${styles.header}`}>
          <div className={styles.headerCopy}>
            <h1>Manage volunteer content</h1>
            <p className={`muted ${styles.description}`}>
              Manage event guides, opportunity cards, and news. Opportunity edits
              change the public card without altering the imported source record.
            </p>
          </div>
          <div className={`actions ${styles.actions}`}>
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

        <nav className={styles.sectionIndex} aria-label="Content sections">
          {canManageJourneys ? (
            <a className={styles.sectionLink} href="#event-guides">
              <span>Event guides</span>
              <span className={styles.sectionCount}>{journeys.length}</span>
            </a>
          ) : null}
          <a className={styles.sectionLink} href="#opportunities">
            <span>Opportunities</span>
            <span className={styles.sectionCount}>{opportunities.length}</span>
            <span className={styles.sectionStatus}>Editable</span>
          </a>
          <a className={styles.sectionLink} href="#news-posts">
            <span>News posts</span>
            <span className={styles.sectionCount}>{newsPosts.length}</span>
          </a>
        </nav>

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
          <section
            id="event-guides"
            className={`section ${styles.section}`}
            aria-labelledby="journeys-title"
          >
            <div className={`section-header ${styles.sectionHeader}`}>
              <div>
                <h2 id="journeys-title">Event guides</h2>
                <p className={styles.sectionMeta}>
                  {journeys.length} current · {pastJourneys.length} past
                </p>
              </div>
              <div className="actions">
                <Link className="text-link" href="/admin/events/past">
                  Past events
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

        <section
          id="opportunities"
          className={`section ${styles.section}`}
          aria-labelledby="opportunities-title"
        >
          <div className={`section-header ${styles.sectionHeader}`}>
            <div>
              <h2 id="opportunities-title">Opportunities</h2>
              <p className={styles.sectionMeta}>
                {opportunities.length} imported listings · manual card overrides supported
              </p>
            </div>
            <Link className="text-link" href="/opportunities">
              View public listings
            </Link>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Card</th>
                  <th scope="col">Source</th>
                  <th scope="col">Starts</th>
                  <th scope="col">Visibility</th>
                  <th scope="col">Order</th>
                  <th scope="col">Action</th>
                </tr>
              </thead>
              <tbody>
                {opportunities.map((opportunity) => (
                  <tr key={opportunity.id}>
                    <td>
                      <strong>{opportunity.title}</strong>
                      {opportunity.hasOverride &&
                      opportunity.title !== opportunity.importedTitle ? (
                        <span className="table-subtext">
                          Imported: {opportunity.importedTitle}
                        </span>
                      ) : null}
                    </td>
                    <td>
                      <span className="status-pill">
                        {opportunity.hasOverride ? "Manual" : "Imported"}
                      </span>
                    </td>
                    <td>{formatSingaporeDateTime(opportunity.startsAt)}</td>
                    <td>
                      <span className="status-pill">
                        {opportunity.isHidden ? "Hidden" : "Visible"}
                      </span>
                    </td>
                    <td>{opportunity.sortOrder ?? "Date"}</td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/admin/content/opportunities/${opportunity.id}/edit`}
                      >
                        Edit card
                      </Link>
                    </td>
                  </tr>
                ))}
                {opportunities.length === 0 ? (
                  <tr>
                    <td colSpan={6}>No imported opportunity records.</td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>

        <section
          id="news-posts"
          className={`section ${styles.section}`}
          aria-labelledby="news-title"
        >
          <div className={`section-header ${styles.sectionHeader}`}>
            <div>
              <h2 id="news-title">News posts</h2>
              <p className={styles.sectionMeta}>
                {newsPosts.length} posts · {access.canPublish ? "Publisher access" : "Editor access"}
              </p>
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
      </main>
      <footer className="site-footer">MENDAKI Volunteer Portal CMS</footer>
    </div>
  );
}
