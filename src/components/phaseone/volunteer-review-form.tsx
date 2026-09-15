import { saveVolunteerReview } from "@/app/admin/events/[id]/reviews/actions";

const positiveBehaviors = [
  ["proactive", "Proactive"],
  ["punctual", "Punctual"],
  ["reliable", "Reliable"],
  ["good_teamwork", "Good teamwork"],
  ["engaged", "Engaged"],
  ["takes_initiative", "Takes initiative"],
  ["communicates_well", "Communicates well"],
  ["good_with_participants", "Good with participants"],
  ["follows_instructions", "Follows instructions"],
  ["safety_conscious", "Safety-conscious"],
] as const;

const concernBehaviors = [
  ["late", "Late"],
  ["unreliable", "Reliability concern"],
  ["disengaged", "Disengaged"],
  ["teamwork_concern", "Teamwork concern"],
  ["did_not_follow_instructions", "Did not follow instructions"],
  ["inappropriate_conduct", "Inappropriate conduct"],
  ["participant_interaction_concern", "Participant interaction concern"],
  ["safety_concern", "Safety / compliance concern"],
  ["communication_concern", "Communication concern"],
  ["left_early", "Left early"],
] as const;

type VolunteerReviewFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
};

export function VolunteerReviewForm({ eventId, rosterId, timeslotId }: VolunteerReviewFormProps) {
  return (
    <details className="phaseone-volunteer-review">
      <summary>
        <span>★ Review volunteer</span>
        <span className="phaseone-volunteer-review-hint">Performance & behaviour</span>
      </summary>
      <form action={saveVolunteerReview} className="phaseone-volunteer-review-form">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />

        <fieldset className="phaseone-review-rating">
          <legend>Overall performance</legend>
          <div className="phaseone-star-rating" aria-label="Overall performance out of 5 stars">
            {[1, 2, 3, 4, 5].map((rating) => (
              <label key={rating}>
                <input name="rating" type="radio" value={rating} required={rating === 1} />
                <span aria-hidden="true">★</span>
                <span className="sr-only">{rating} out of 5</span>
              </label>
            ))}
          </div>
          <p className="muted">Rate how effectively the volunteer performed their assigned role at this event.</p>
        </fieldset>

        <fieldset className="phaseone-review-behaviors">
          <legend>Positive behaviours observed <span className="muted">optional</span></legend>
          <div className="phaseone-review-tag-grid">
            {positiveBehaviors.map(([value, label]) => (
              <label className="phaseone-review-tag" key={value}>
                <input name="positiveBehaviors" type="checkbox" value={value} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="phaseone-review-behaviors">
          <legend>Concerns observed <span className="muted">optional</span></legend>
          <div className="phaseone-review-tag-grid">
            {concernBehaviors.map(([value, label]) => (
              <label className="phaseone-review-tag phaseone-review-tag-concern" key={value}>
                <input name="concernBehaviors" type="checkbox" value={value} />
                <span>{label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-field">
          <label htmlFor={`review-comments-${rosterId}`}>Staff comments <span className="muted">optional</span></label>
          <textarea
            id={`review-comments-${rosterId}`}
            name="comments"
            maxLength={2000}
            rows={3}
            placeholder="Add short, factual context that will help another staff member understand the review."
          />
        </div>

        <label className="phaseone-review-follow-up">
          <input name="followUpRequired" type="checkbox" />
          <span><strong>Requires follow-up</strong><small>Use for conduct, safeguarding, reliability or other issues that need staff attention.</small></span>
        </label>

        <div className="phaseone-inline-insight-actions">
          <button className="button button-primary" type="submit">Save review</button>
          <span className="muted">Submitting again updates your review for this volunteer and event.</span>
        </div>
      </form>
    </details>
  );
}
