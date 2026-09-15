import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  concernBehaviorLabel,
  positiveBehaviorLabel,
  starRating,
} from "@/lib/phaseone/volunteer-reviews";

type VolunteerReviewsSectionProps = {
  eventId: string;
};

type ReviewRow = {
  id: string;
  roster_id: string;
  volunteer_person_key: string;
  rating: number;
  positive_behaviors: string[];
  concern_behaviors: string[];
  comment: string | null;
  follow_up_required: boolean;
  reviewed_at: string;
  phaseone_roster:
    | { volunteer_name: string; volunteer_key: string | null; email: string | null; mobile: string | null }
    | { volunteer_name: string; volunteer_key: string | null; email: string | null; mobile: string | null }[]
    | null;
};

function rosterFor(review: ReviewRow) {
  return Array.isArray(review.phaseone_roster) ? review.phaseone_roster[0] : review.phaseone_roster;
}

export async function VolunteerReviewsSection({ eventId }: VolunteerReviewsSectionProps) {
  const admin = getPhaseOneAdminClient();
  const result = await admin
    .from("phaseone_volunteer_reviews")
    .select("id, roster_id, volunteer_person_key, rating, positive_behaviors, concern_behaviors, comment, follow_up_required, reviewed_at, phaseone_roster(volunteer_name, volunteer_key, email, mobile)")
    .eq("event_id", eventId)
    .order("reviewed_at", { ascending: false })
    .limit(2000);

  if (result.error || !result.data) {
    throw new Error("Volunteer reviews could not be loaded");
  }

  const reviews = result.data as ReviewRow[];
  const grouped = new Map<string, ReviewRow[]>();
  for (const review of reviews) {
    const current = grouped.get(review.volunteer_person_key) ?? [];
    current.push(review);
    grouped.set(review.volunteer_person_key, current);
  }

  const groups = Array.from(grouped.values()).sort((a, b) => {
    const aName = rosterFor(a[0]!)?.volunteer_name ?? "";
    const bName = rosterFor(b[0]!)?.volunteer_name ?? "";
    return aName.localeCompare(bName);
  });
  const followUpCount = reviews.filter((review) => review.follow_up_required).length;

  return (
    <section className="compact-section" id="reviews" aria-labelledby="reviews-title">
      <div className="section-header compact-section-header">
        <div>
          <h2 id="reviews-title">Volunteer reviews</h2>
          <p className="compact-section-meta">Event-level performance feedback from staff. Ratings describe performance in the assigned role, not the volunteer as a person.</p>
        </div>
        <div className="actions">
          <span className="status-pill">{reviews.length} reviews</span>
          {followUpCount > 0 ? <span className="status-pill" data-state="anomaly">{followUpCount} follow-up</span> : null}
        </div>
      </div>

      <div className="volunteer-review-history">
        {groups.map((group) => {
          const first = group[0]!;
          const roster = rosterFor(first);
          const average = group.reduce((total, review) => total + review.rating, 0) / group.length;
          const requiresFollowUp = group.some((review) => review.follow_up_required);
          return (
            <details className="volunteer-review-history-person" key={first.volunteer_person_key}>
              <summary>
                <span>
                  <strong>{roster?.volunteer_name ?? "Unknown volunteer"}</strong>
                  <small>{roster?.volunteer_key ?? roster?.email ?? roster?.mobile ?? "No matching identifier"}</small>
                </span>
                <span className="volunteer-review-history-score">
                  <strong>{average.toFixed(1)} / 5</strong>
                  <small>{group.length} review{group.length === 1 ? "" : "s"}{requiresFollowUp ? " · follow-up" : ""}</small>
                </span>
              </summary>
              <div className="volunteer-review-history-entries">
                {group.map((review) => (
                  <article className="volunteer-review-history-entry" key={review.id}>
                    <div className="volunteer-review-history-entry-heading">
                      <strong aria-label={`${review.rating} out of 5 stars`}>{starRating(review.rating)}</strong>
                      <span className="muted">{formatSingaporeDateTime(review.reviewed_at)}</span>
                    </div>
                    {review.positive_behaviors.length > 0 ? (
                      <div className="volunteer-review-history-tags" aria-label="Positive behaviours">
                        {review.positive_behaviors.map((behavior) => (
                          <span className="volunteer-review-history-tag" key={behavior}>{positiveBehaviorLabel[behavior] ?? behavior}</span>
                        ))}
                      </div>
                    ) : null}
                    {review.concern_behaviors.length > 0 ? (
                      <div className="volunteer-review-history-tags" aria-label="Behaviours of concern">
                        {review.concern_behaviors.map((behavior) => (
                          <span className="volunteer-review-history-tag volunteer-review-history-tag-concern" key={behavior}>{concernBehaviorLabel[behavior] ?? behavior}</span>
                        ))}
                      </div>
                    ) : null}
                    {review.comment ? <p>{review.comment}</p> : null}
                    {review.follow_up_required ? <p className="volunteer-review-follow-up-flag">Requires staff follow-up</p> : null}
                  </article>
                ))}
              </div>
            </details>
          );
        })}
        {groups.length === 0 ? <p className="empty-state">No volunteer reviews have been recorded for this event yet.</p> : null}
      </div>
    </section>
  );
}
