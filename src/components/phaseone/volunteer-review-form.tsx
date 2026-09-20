import { saveVolunteerReview } from "@/app/admin/events/[id]/reviews/actions";
import { KButton, KCheckbox, KRadio, KTextarea } from "@/components/ui/keluarga-ui";
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
  { value: 5, label: "Excellent" },
  { value: 4, label: "Good" },
  { value: 3, label: "Meets expectations" },
  { value: 2, label: "Needs improvement" },
  { value: 1, label: "Significant concerns" },
];

export function VolunteerReviewForm({ eventId, rosterId, timeslotId }: VolunteerReviewFormProps) {
  return (
    <details className="phaseone-volunteer-review">
      <summary aria-label="Review volunteer">
        <span>★ Review</span>
        <span className="phaseone-volunteer-review-hint">Quick rating + optional notes</span>
      </summary>
      <form action={saveVolunteerReview} className="volunteer-review-form">
        <input name="eventId" type="hidden" value={eventId} />
        <input name="rosterId" type="hidden" value={rosterId} />
        <input name="timeslotId" type="hidden" value={timeslotId} />

        <fieldset className="volunteer-review-fieldset volunteer-review-rating-fieldset">
          <legend>How did they do?</legend>
          <p className="muted volunteer-review-rating-help">Choose the closest overall rating. Add detail only when it is useful.</p>
          <div className="volunteer-review-rating-options">
            {ratingOptions.map((option) => (
              <KRadio
                className="volunteer-review-rating"
                key={option.value}
                label={(
                  <span className="volunteer-review-rating-copy">
                    <strong className="volunteer-review-score">{option.value}★</strong>
                    <span className="volunteer-review-rating-label">{option.label}</span>
                  </span>
                )}
                name="rating"
                required
                value={String(option.value)}
              />
            ))}
          </div>
        </fieldset>

        <details className="volunteer-review-more">
          <summary>
            <span>+ Add detail</span>
            <span>Strengths, concerns, context or follow-up</span>
          </summary>
          <div className="volunteer-review-more-body">
            <fieldset className="volunteer-review-fieldset">
              <legend>What went well? <span className="muted">optional</span></legend>
              <div className="volunteer-review-tags">
                {positiveBehaviorOptions.map((option) => (
                  <KCheckbox
                    className="volunteer-review-tag"
                    key={option.value}
                    label={option.label}
                    name="positiveBehaviors"
                    value={option.value}
                  />
                ))}
              </div>
            </fieldset>

            <fieldset className="volunteer-review-fieldset">
              <legend>Anything to flag? <span className="muted">optional</span></legend>
              <div className="volunteer-review-tags volunteer-review-tags-concern">
                {concernBehaviorOptions.map((option) => (
                  <KCheckbox
                    className="volunteer-review-tag"
                    key={option.value}
                    label={option.label}
                    name="concernBehaviors"
                    value={option.value}
                  />
                ))}
              </div>
            </fieldset>

            <KTextarea
              id={`review-comment-${rosterId}`}
              label={<>Context <span className="muted">optional</span></>}
              maxLength={1500}
              name="comment"
              placeholder="Short factual note or example, if needed."
              rows={2}
            />

            <KCheckbox
              className="volunteer-review-follow-up"
              label={(
                <span>
                  <strong>Requires staff follow-up</strong>
                  <small>Use only when something should be discussed or acted on.</small>
                </span>
              )}
              name="followUpRequired"
            />
          </div>
        </details>

        <div className="phaseone-inline-insight-actions volunteer-review-actions">
          <KButton type="submit">Save review</KButton>
          <small className="muted">Saving again updates your review for this event.</small>
        </div>
      </form>
    </details>
  );
}
