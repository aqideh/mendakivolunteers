import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import { addVolunteerInsight, reviewVolunteerInsight } from "./actions";

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

const behaviorLabels: Record<string, string> = {
  proactive: "Proactive",
  punctual: "Punctual",
  reliable: "Reliable",
  good_teamwork: "Good teamwork",
  engaged: "Engaged",
  takes_initiative: "Takes initiative",
  communicates_well: "Communicates well",
  good_with_participants: "Good with participants",
  follows_instructions: "Follows instructions",
  safety_conscious: "Safety-conscious",
  late: "Late",
  unreliable: "Reliability concern",
  disengaged: "Disengaged",
  teamwork_concern: "Teamwork concern",
  did_not_follow_instructions: "Did not follow instructions",
  inappropriate_conduct: "Inappropriate conduct",
  participant_interaction_concern: "Participant interaction concern",
  safety_concern: "Safety / compliance concern",
  communication_concern: "Communication concern",
  left_early: "Left early",
};

type PageProps = { params: Promise<{ id: string }> };

export default async function VolunteerInsightsPage({ params }: PageProps) {
  const { id } = await params;
  await requireEventManager(`/admin/events/${id}/insights`);
  const admin = getPhaseOneAdminClient();

  const [eventResult, rosterResult, insightsResult, reviewsResult] = await Promise.all([
    admin.from("phaseone_events").select("id, title, venue").eq("id", id).maybeSingle(),
    admin
      .from("phaseone_roster")
      .select("id, timeslot_id, volunteer_key, volunteer_name, email, mobile, attendance_person_key")
      .eq("event_id", id)
      .order("volunteer_name")
      .limit(2000),
    admin
      .from("phaseone_volunteer_insights")
      .select("id, roster_id, category, value, detail, source_type, review_status, captured_at, volunteer_person_key, phaseone_roster(volunteer_name, volunteer_key, email, mobile)")
      .eq("event_id", id)
      .order("captured_at", { ascending: false })
      .limit(2000),
    admin
      .from("phaseone_volunteer_reviews")
      .select("id, roster_id, volunteer_person_key, rating, positive_behaviors, concern_behaviors, comments, follow_up_required, reviewed_at, phaseone_roster(volunteer_name, volunteer_key, email, mobile)")
      .eq("event_id", id)
      .order("reviewed_at", { ascending: false })
      .limit(2000),
  ]);

  if (eventResult.error) throw new Error("Event could not be loaded");
  if (!eventResult.data) notFound();
  if (
    rosterResult.error || !rosterResult.data
    || insightsResult.error || !insightsResult.data
    || reviewsResult.error || !reviewsResult.data
  ) {
    throw new Error("Volunteer insights and reviews could not be loaded");
  }

  const rosterByPerson = new Map<string, (typeof rosterResult.data)[number]>();
  for (const volunteer of rosterResult.data) {
    if (!rosterByPerson.has(volunteer.attendance_person_key)) {
      rosterByPerson.set(volunteer.attendance_person_key, volunteer);
    }
  }
  const volunteers = Array.from(rosterByPerson.values());

  const insights = insightsResult.data;
  const submitted = insights.filter((item) => item.review_status === "submitted");
  const accepted = insights.filter((item) => item.review_status === "accepted");
  const dismissed = insights.filter((item) => item.review_status === "dismissed");
  const volunteerCount = new Set(insights.map((item) => item.volunteer_person_key)).size;
  const insightCountByPerson = new Map<string, number>();
  for (const insight of insights) {
    insightCountByPerson.set(insight.volunteer_person_key, (insightCountByPerson.get(insight.volunteer_person_key) ?? 0) + 1);
  }

  const reviews = reviewsResult.data;
  const reviewVolunteerCount = new Set(reviews.map((review) => review.volunteer_person_key)).size;
  const followUpCount = reviews.filter((review) => review.follow_up_required).length;
  const averageRating = reviews.length
    ? reviews.reduce((total, review) => total + review.rating, 0) / reviews.length
    : null;

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer insights" dashboard />
      <main className="page-frame compact-page volunteer-insights-page">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Event operations</p>
            <h1>{eventResult.data.title}</h1>
            <p className="muted">Capture useful things staff learn on the ground and keep event-level volunteer performance reviews in one place.</p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href={`/admin/events/${id}/attendance`}>Roster / attendance</Link>
            <a className="button button-primary" href={`/admin/events/${id}/insights/export`}>Export accepted</a>
          </div>
        </div>

        <nav className="compact-section-index" aria-label="Volunteer insight sections">
          <div className="compact-section-index-track">
            <a className="compact-section-index-link" href="#capture">Capture <span className="compact-section-index-count">{volunteers.length}</span></a>
            <a className="compact-section-index-link" href="#performance-reviews">Reviews <span className="compact-section-index-count">{reviews.length}</span></a>
            <a className="compact-section-index-link" href="#review">Review <span className="compact-section-index-count">{submitted.length}</span></a>
            <a className="compact-section-index-link" href="#accepted">Accepted <span className="compact-section-index-count">{accepted.length}</span></a>
            <a className="compact-section-index-link" href="#dismissed">Dismissed <span className="compact-section-index-count">{dismissed.length}</span></a>
          </div>
        </nav>

        <section className="insight-summary-strip" aria-label="Volunteer insight summary">
          <span><strong>{insights.length}</strong> captured</span>
          <span><strong>{volunteerCount}</strong> volunteers enriched</span>
          <span><strong>{submitted.length}</strong> need review</span>
          <span><strong>{accepted.length}</strong> accepted</span>
          <span><strong>{reviews.length}</strong> staff reviews</span>
          <span><strong>{reviewVolunteerCount}</strong> volunteers reviewed</span>
          <span><strong>{averageRating === null ? "—" : averageRating.toFixed(1)}</strong> avg rating</span>
          <span><strong>{followUpCount}</strong> need follow-up</span>
        </section>

        <section className="compact-section" id="capture" aria-labelledby="capture-title">
          <div className="section-header compact-section-header">
            <div><h2 id="capture-title">Capture from roster</h2><p className="compact-section-meta">Tap a volunteer and record one useful thing. Keep entries specific and operationally relevant.</p></div>
          </div>
          <div className="insight-capture-list">
            {volunteers.map((volunteer) => (
              <details className="insight-capture-row" key={volunteer.attendance_person_key}>
                <summary>
                  <span><strong>{volunteer.volunteer_name}</strong><small>{volunteer.volunteer_key ?? volunteer.email ?? volunteer.mobile ?? "No volunteer ID"}</small></span>
                  <span className="insight-capture-count">{insightCountByPerson.get(volunteer.attendance_person_key) ?? 0} insights</span>
                </summary>
                <form action={addVolunteerInsight} className="insight-capture-form">
                  <input name="eventId" type="hidden" value={id} />
                  <input name="rosterId" type="hidden" value={volunteer.id} />
                  <input name="timeslotId" type="hidden" value={volunteer.timeslot_id} />
                  <div className="insight-capture-grid">
                    <div className="form-field">
                      <label htmlFor={`category-${volunteer.id}`}>What did you learn?</label>
                      <select id={`category-${volunteer.id}`} name="category" defaultValue="skill">
                        <option value="skill">Skill</option>
                        <option value="interest">Interest</option>
                        <option value="experience">Experience</option>
                        <option value="connection">Connection / affiliation</option>
                        <option value="role_preference">Role preference</option>
                        <option value="availability">Availability</option>
                        <option value="language">Language</option>
                        <option value="development">Development interest</option>
                        <option value="follow_up">Follow-up</option>
                        <option value="note">Other useful note</option>
                      </select>
                    </div>
                    <div className="form-field">
                      <label htmlFor={`source-${volunteer.id}`}>Source</label>
                      <select id={`source-${volunteer.id}`} name="sourceType" defaultValue="volunteer_shared">
                        <option value="volunteer_shared">Volunteer told me</option>
                        <option value="staff_observed">Staff observed</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-field">
                    <label htmlFor={`value-${volunteer.id}`}>Insight</label>
                    <input id={`value-${volunteer.id}`} name="value" maxLength={240} placeholder="e.g. Photography, interested in mentoring, weekends" required />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`detail-${volunteer.id}`}>Context <span className="muted">optional</span></label>
                    <textarea id={`detail-${volunteer.id}`} name="detail" maxLength={1500} rows={2} placeholder="Short factual context that will help someone understand this later" />
                  </div>
                  <button className="button button-primary" type="submit">Save insight</button>
                </form>
              </details>
            ))}
            {volunteers.length === 0 ? <p className="empty-state">No volunteers are on this event roster yet.</p> : null}
          </div>
        </section>

        <section className="compact-section" id="performance-reviews" aria-labelledby="performance-reviews-title">
          <div className="section-header compact-section-header">
            <div>
              <h2 id="performance-reviews-title">Volunteer performance reviews</h2>
              <p className="compact-section-meta">Event-level staff assessments. Ratings describe performance in the assigned role, while behaviour tags and follow-up flags provide operational context.</p>
            </div>
          </div>
          <div className="volunteer-performance-review-list">
            {reviews.map((review) => {
              const roster = Array.isArray(review.phaseone_roster) ? review.phaseone_roster[0] : review.phaseone_roster;
              const positiveBehaviors = (review.positive_behaviors ?? []) as string[];
              const concernBehaviors = (review.concern_behaviors ?? []) as string[];
              return (
                <article className="volunteer-performance-review-row" key={review.id}>
                  <div className="volunteer-performance-review-person">
                    <strong>{roster?.volunteer_name ?? "Unknown volunteer"}</strong>
                    <span className="muted">{roster?.volunteer_key ?? roster?.email ?? roster?.mobile ?? "No matching identifier"}</span>
                  </div>
                  <div className="volunteer-performance-review-content">
                    <span className="volunteer-performance-review-stars" aria-label={`${review.rating} out of 5 stars`}>
                      {"★".repeat(review.rating)}{"☆".repeat(5 - review.rating)}
                    </span>
                    <span className="muted">Staff review · {formatSingaporeDateTime(review.reviewed_at)}</span>
                    {positiveBehaviors.length || concernBehaviors.length ? (
                      <div className="volunteer-performance-review-tags">
                        {positiveBehaviors.map((behavior) => <span key={`positive-${review.id}-${behavior}`}>+ {behaviorLabels[behavior] ?? behavior.replaceAll("_", " ")}</span>)}
                        {concernBehaviors.map((behavior) => <span key={`concern-${review.id}-${behavior}`}>! {behaviorLabels[behavior] ?? behavior.replaceAll("_", " ")}</span>)}
                      </div>
                    ) : null}
                    {review.comments ? <p>{review.comments}</p> : null}
                    {review.follow_up_required ? <span className="volunteer-review-follow-up-pill">Requires follow-up</span> : null}
                  </div>
                </article>
              );
            })}
            {reviews.length === 0 ? <p className="empty-state">No volunteer reviews have been submitted for this event yet.</p> : null}
          </div>
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
          <div className="section-header compact-section-header"><div><h2 id="accepted-title">Accepted</h2><p className="compact-section-meta">These insights have passed staff review.</p></div></div>
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
