import type { Metadata } from "next";
import Link from "next/link";

import { duplicateEvent } from "@/app/admin/events/actions";
import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import {
  getAdminEventEffectiveEnd,
  splitAdminEvents,
  type AdminEventSummary,
} from "@/lib/phaseone/admin-events";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  formatTimeslotDate,
  getPackageListingStatus,
  singaporeDateKey,
  sortTimeslots,
  type VolunteerTimeslot,
} from "@/lib/phaseone/packages";

export const metadata: Metadata = { title: "Past events" };
export const dynamic = "force-dynamic";

const pageSize = 50;
const validSorts = new Set(["date_desc", "date_asc", "name_asc", "name_desc"]);

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(values: Record<string, string | string[] | undefined>, key: string) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function pageHref(
  parameters: { q: string; from: string; to: string; sort: string },
  page: number,
): string {
  const query = new URLSearchParams();
  if (parameters.q) query.set("q", parameters.q);
  if (parameters.from) query.set("from", parameters.from);
  if (parameters.to) query.set("to", parameters.to);
  if (parameters.sort !== "date_desc") query.set("sort", parameters.sort);
  if (page > 1) query.set("page", String(page));
  const value = query.toString();
  return value ? `/admin/events/past?${value}` : "/admin/events/past";
}

export default async function PastEventsPage({ searchParams }: PageProps) {
  await requireEventManager("/admin/events/past");
  const admin = getPhaseOneAdminClient();
  const [eventsResult, timeslotsResult] = await Promise.all([
    admin
      .from("phaseone_events")
      .select("id, title, slug, venue, reporting_at, has_sign_in_pin, has_sign_out_pin, briefing_available_at, is_published, updated_at")
      .order("updated_at", { ascending: false })
      .limit(5000),
    admin
      .from("phaseone_event_timeslots")
      .select("id, event_id, label, starts_at, ends_at, status, sort_order")
      .order("starts_at", { ascending: true })
      .order("sort_order", { ascending: true })
      .limit(50000),
  ]);

  if (eventsResult.error || !eventsResult.data || timeslotsResult.error || !timeslotsResult.data) {
    console.error("Unable to load past events", {
      eventsCode: eventsResult.error?.code,
      timeslotsCode: timeslotsResult.error?.code,
    });
    throw new Error("Past events could not be loaded");
  }

  const timeslotsByEvent = new Map<string, VolunteerTimeslot[]>();
  for (const timeslot of timeslotsResult.data) {
    const current = timeslotsByEvent.get(timeslot.event_id) ?? [];
    current.push(timeslot as VolunteerTimeslot);
    timeslotsByEvent.set(timeslot.event_id, current);
  }

  const allEvents = eventsResult.data.map((event) => ({
    ...event,
    timeslots: sortTimeslots(timeslotsByEvent.get(event.id) ?? []),
  })) as AdminEventSummary[];
  const { past } = splitAdminEvents(allEvents);

  const rawParameters = await searchParams;
  const q = (parameter(rawParameters, "q") ?? "").trim();
  const from = (parameter(rawParameters, "from") ?? "").trim();
  const to = (parameter(rawParameters, "to") ?? "").trim();
  const requestedSort = parameter(rawParameters, "sort") ?? "date_desc";
  const sort = validSorts.has(requestedSort) ? requestedSort : "date_desc";
  const requestedPage = Number.parseInt(parameter(rawParameters, "page") ?? "1", 10);
  const currentPage = Number.isFinite(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const normalizedQuery = q.toLocaleLowerCase("en-SG");

  const filtered = past
    .filter((event) => {
      const effectiveEnd = getAdminEventEffectiveEnd(event);
      if (!effectiveEnd) return false;
      const date = singaporeDateKey(effectiveEnd);
      const matchesQuery = !normalizedQuery || event.title.toLocaleLowerCase("en-SG").includes(normalizedQuery);
      const matchesFrom = !from || date >= from;
      const matchesTo = !to || date <= to;
      return matchesQuery && matchesFrom && matchesTo;
    })
    .sort((left, right) => {
      if (sort === "name_asc") return left.title.localeCompare(right.title);
      if (sort === "name_desc") return right.title.localeCompare(left.title);
      const leftEnd = getAdminEventEffectiveEnd(left) ?? "";
      const rightEnd = getAdminEventEffectiveEnd(right) ?? "";
      return sort === "date_asc"
        ? leftEnd.localeCompare(rightEnd)
        : rightEnd.localeCompare(leftEnd);
    });

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const page = Math.min(currentPage, totalPages);
  const visible = filtered.slice((page - 1) * pageSize, page * pageSize);
  const linkParameters = { q, from, to, sort };

  return (
    <div className="site-shell">
      <PortalHeader status="Past events" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Event operations archive</p>
            <h1>Past events</h1>
            <p className="muted">Events move here two weeks after their final scheduled shift.</p>
          </div>
          <Link className="button button-secondary" href="/admin/events">Current events</Link>
        </div>

        <section className="panel phaseone-admin-section" aria-labelledby="past-event-filters">
          <div className="section-header">
            <div>
              <p className="eyebrow">Find an event</p>
              <h2 id="past-event-filters">Search and filter</h2>
            </div>
            <span className="status-pill">{filtered.length} events</span>
          </div>
          <form className="phaseone-attendance-filters" method="get">
            <div className="form-field">
              <label htmlFor="q">Event name</label>
              <input id="q" name="q" defaultValue={q} placeholder="Search event name" />
            </div>
            <div className="form-field">
              <label htmlFor="from">From date</label>
              <input id="from" name="from" type="date" defaultValue={from} />
            </div>
            <div className="form-field">
              <label htmlFor="to">To date</label>
              <input id="to" name="to" type="date" defaultValue={to} />
            </div>
            <div className="form-field">
              <label htmlFor="sort">Sort</label>
              <select id="sort" name="sort" defaultValue={sort}>
                <option value="date_desc">Most recent</option>
                <option value="date_asc">Oldest first</option>
                <option value="name_asc">Name A–Z</option>
                <option value="name_desc">Name Z–A</option>
              </select>
            </div>
            <button className="button button-secondary" type="submit">Apply</button>
            {(q || from || to || sort !== "date_desc") ? (
              <Link className="text-link" href="/admin/events/past">Clear filters</Link>
            ) : null}
          </form>
        </section>

        <div className="table-wrap">
          <table className="content-table">
            <thead>
              <tr><th>Event</th><th>Final date</th><th>Venue</th><th>Visibility</th><th>Actions</th></tr>
            </thead>
            <tbody>
              {visible.map((event) => {
                const effectiveEnd = getAdminEventEffectiveEnd(event);
                return (
                  <tr key={event.id}>
                    <td>
                      <strong>{event.title}</strong>
                      <span className="table-subtext">/journey/{event.slug}</span>
                    </td>
                    <td>
                      {effectiveEnd ? formatTimeslotDate(effectiveEnd) : "Not set"}
                      {event.timeslots.length > 1 ? <span className="table-subtext">{event.timeslots.length} timeslots</span> : null}
                    </td>
                    <td>{event.venue ?? "Not set"}</td>
                    <td><span className="status-pill">{getPackageListingStatus(event.timeslots, event.is_published)}</span></td>
                    <td>
                      <div className="actions">
                        <Link className="text-link" href={`/admin/events/${event.id}/attendance`}>Roster / check-in</Link>
                        <Link className="text-link" href={`/admin/events/${event.id}/edit`}>Edit</Link>
                        <form action={duplicateEvent}>
                          <input type="hidden" name="eventId" value={event.id} />
                          <button className="text-link button-reset" type="submit">Duplicate journey</button>
                        </form>
                        {event.is_published ? (
                          <Link className="text-link" href={`/journey/${event.slug}`} target="_blank">View event guide</Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                );
              })}
              {visible.length === 0 ? <tr><td colSpan={5}>No past events match these filters.</td></tr> : null}
            </tbody>
          </table>
        </div>

        {totalPages > 1 ? (
          <nav className="actions" aria-label="Past events pagination">
            {page > 1 ? <Link className="button button-secondary" href={pageHref(linkParameters, page - 1)}>Previous</Link> : null}
            <span className="muted">Page {page} of {totalPages}</span>
            {page < totalPages ? <Link className="button button-secondary" href={pageHref(linkParameters, page + 1)}>Next</Link> : null}
          </nav>
        ) : null}
      </main>
    </div>
  );
}
