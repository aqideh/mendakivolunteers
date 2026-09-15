import { saveVolunteerReview } from "@/app/admin/events/[id]/reviews/actions";
import {
  concernBehaviorOptions,
  positiveBehaviorOptions,
} from "@/lib/phaseone/volunteer-reviews";

type VolunteerReviewFormProps = {
  eventId: string;
  rosterId: string;
  timeslotId: string;
};

const ratingOptions = [
  { value: 5, stars: "★★★★★", label: "Excellent" },
  { value: 4, stars: "★★★★☆", label: "Good" },
  { value: 3, stars: "★★★☆☆", label: "Meets expectations" },
  { value: 2, stars: "★★☆☆☆", label: "Needs improvement" },
  { value: 1, stars: "★☆☆☆☆", label: "Significant concerns" },
];

export function VolunteerReviewForm({ eventId, rosterId, timeslotId }: VolunteerReviewFormProps) {
  return (
    <details className="phaseone-volunteer-review">
      <summary>
        <span>★ Review volunteer</span>
        <span className="phaseone-volunteer-review-hint">Performance &amp; behaviour</span>
      </summary>
      <form action={saveVolunteerReview} className="volunteer-review-form">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />

        <fieldset className="volunteer-review-fieldset">
          <legend>Overall performance</legend>
          <p className="muted">Rate how effectively the volunteer performed their assigned role at this event.</p>
          <div className="volunteer-review-rating-options">
            {ratingOptions.map((option) => (
              <label className="volunteer-review-rating" key={option.value}>
                <input name="rating" required type="radio" value={option.value} />
                <span className="volunteer-review-stars" aria-hidden="true">{option.stars}</span>
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="volunteer-review-fieldset">
          <legend>Positive behaviours <span className="muted">optional</span></legend>
          <div className="volunteer-review-tags">
            {positiveBehaviorOptions.map((option) => (
              <label className="volunteer-review-tag" key={option.value}>
                <input name="positiveBehaviors" type="checkbox" value={option.value} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="volunteer-review-fieldset">
          <legend>Behaviours of concern <span className="muted">optional</span></legend>
          <div className="volunteer-review-tags volunteer-review-tags-concern">
            {concernBehaviorOptions.map((option) => (
              <label className="volunteer-review-tag" key={option.value}>
                <input name="concernBehaviors" type="checkbox" value={option.value} />
                <span>{option.label}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-field">
          <label htmlFor={`review-comment-${rosterId}`}>Context <span className="muted">optional</span></label>
          <textarea
            id={`review-comment-${rosterId}`}
            maxLength={1500}
            name="comment"
            placeholder="Record factual context or an example of the behaviour observed."
            rows={3}
          />
        </div>

        <label className="volunteer-review-follow-up">
          <input name="followUpRequired" type="checkbox" />
          <span><strong>Requires staff follow-up</strong><small>Use for something that should be discussed or acted on. A low rating alone does not create a follow-up.</small></span>
        </label>

        <div className="phaseone-inline-insight-actions">
          <button className="button button-primary" type="submit">Save review</button>
          <small className="muted">Submitting again updates your review for this volunteer at this event.</small>
        </div>
      </form>
    </details>
  );
}
