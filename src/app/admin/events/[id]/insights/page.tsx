import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import { reviewVolunteerInsight } from "./actions";

export const metadata: Metadata = { title: "Volunteer insights" };
export const dynamic = "force-dynamic";

const categoryLabels: Record<string, string> = {
  skill: "Skill",
  interest: "Interest",
  experience: "Experience",
  connection: "Connection",
  role_preference: "Role preference",
  availability: "Availability",
  language: "Language",
  development: "Development",
  follow_up: "Follow-up",
  note: "Note",
};

const sourceLabels: Record<string, string> = {
  volunteer_shared: "Volunteer shared",
  staff_observed: "Staff observed",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function VolunteerInsightsPage({ params }: PageProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/insights`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, insightsResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, venue").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_volunteer_insights")
      .select("id, roster_id, category, value, detail, source_type, review_status, captured_at, volunteer_person_key, phaseone_roster(volunteer_name, volunteer_key, email, mobile)")
      .eq("event_id", id)
      .order("captured_at", { ascending: false })
      .limit(2000),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (insightsResult.error || !insightsResult.data) {
    throw new Error("Volunteer insights could not be loaded");
  }

  const insights = insightsResult.data;
  const submitted = insights.filter((item) => item.review_status === "submitted");
  const accepted = insights.filter((item) => item.review_status === "accepted");
  const dismissed = insights.filter((item) => item.review_status === "dismissed");
  const volunteerCount = new Set(insights.map((item) => item.volunteer_person_key)).size;

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer insights" dashboard />
      <main className="page-frame compact-page volunteer-insights-page">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Event operations</p>
            <h1>{eventResult.data.title}</h1>
            <p className="muted">Review what staff learned about volunteers before handing accepted insights to MakLom.</p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href={`/admin/events/${id}/attendance`}>Roster / attendance</Link>
            <a className="button button-primary" href={`/admin/events/${id}/insights/export`}>Export accepted</a>
          </div>
        </div>

        <nav className="compact-section-index" aria-label="Insight review sections">
          <div className="compact-section-index-track">
            <a className="compact-section-index-link" href="#review">Review <span className="compact-section-index-count">{submitted.length}</span></a>
            <a className="compact-section-index-link" href="#accepted">Accepted <span className="compact-section-index-count">{accepted.length}</span></a>
            <a className="compact-section-index-link" href="#dismissed">Dismissed <span className="compact-section-index-count">{dismissed.length}</span></a>
          </div>
        </nav>

        <section className="insight-summary-strip" aria-label="Volunteer insight summary">
          <span><strong>{insights.length}</strong> captured</span>
          <span><strong>{volunteerCount}</strong> volunteers enriched</span>
          <span><strong>{submitted.length}</strong> need review</span>
          <span><strong>{accepted.length}</strong> handoff-ready</span>
        </section>

        <section className="compact-section" id="review" aria-labelledby="review-title">
          <div className="section-header compact-section-header">
            <div><h2 id="review-title">Needs review</h2><p className="compact-section-meta">Accept only information that is useful, factual and appropriate for the volunteer profile.</p></div>
          </div>
          <div className="insight-review-list">
            {submitted.map((insight) => {
              const roster = Array.isArray(insight.phaseone_roster) ? insight.phaseone_roster[0] : insight.phaseone_roster;
              return (
                <article className="insight-review-row" key={insight.id}>
                  <div className="insight-review-person">
                    <strong>{roster?.volunteer_name ?? "Unknown volunteer"}</strong>
                    <span>{roster?.volunteer_key ?? roster?.email ?? roster?.mobile ?? "No matching identifier"}</span>
                  </div>
                  <div className="insight-review-content">
                    <span className="record-kicker">{categoryLabels[insight.category] ?? insight.category} · {sourceLabels[insight.source_type] ?? insight.source_type}</span>
                    <strong>{insight.value}</strong>
                    {insight.detail ? <p>{insight.detail}</p> : null}
                    <span className="muted">Captured {formatSingaporeDateTime(insight.captured_at)}</span>
                  </div>
                  <div className="insight-review-actions">
                    <form action={reviewVolunteerInsight}>
                      <input name="eventId" type="hidden" value={id} />
                      <input name="insightId" type="hidden" value={insight.id} />
                      <input name="decision" type="hidden" value="accepted" />
                      <button className="button button-primary" type="submit">Accept</button>
                    </form>
                    <form action={reviewVolunteerInsight}>
                      <input name="eventId" type="hidden" value={id} />
                      <input name="insightId" type="hidden" value={insight.id} />
                      <input name="decision" type="hidden" value="dismissed" />
                      <button className="button button-secondary" type="submit">Dismiss</button>
                    </form>
                  </div>
                </article>
              );
            })}
            {submitted.length === 0 ? <p className="empty-state">No insights are waiting for review.</p> : null}
          </div>
        </section>

        <section className="compact-section" id="accepted" aria-labelledby="accepted-title">
          <div className="section-header compact-section-header"><div><h2 id="accepted-title">Accepted</h2><p className="compact-section-meta">These rows are eligible for MakLom handoff.</p></div></div>
          <div className="insight-history-list">
            {accepted.map((insight) => {
              const roster = Array.isArray(insight.phaseone_roster) ? insight.phaseone_roster[0] : insight.phaseone_roster;
              return <div className="insight-history-row" key={insight.id}><strong>{roster?.volunteer_name ?? "Unknown volunteer"}</strong><span>{categoryLabels[insight.category] ?? insight.category}: {insight.value}</span></div>;
            })}
            {accepted.length === 0 ? <p className="empty-state">No accepted insights yet.</p> : null}
          </div>
        </section>

        <section className="compact-section" id="dismissed" aria-labelledby="dismissed-title">
          <div className="section-header compact-section-header"><div><h2 id="dismissed-title">Dismissed</h2><p className="compact-section-meta">Retained for audit context but excluded from handoff.</p></div></div>
          <div className="insight-history-list">
            {dismissed.map((insight) => {
              const roster = Array.isArray(insight.phaseone_roster) ? insight.phaseone_roster[0] : insight.phaseone_roster;
              return <div className="insight-history-row" key={insight.id}><strong>{roster?.volunteer_name ?? "Unknown volunteer"}</strong><span>{categoryLabels[insight.category] ?? insight.category}: {insight.value}</span></div>;
            })}
            {dismissed.length === 0 ? <p className="empty-state">No dismissed insights.</p> : null}
          </div>
        </section>
      </main>
    </div>
  );
}
