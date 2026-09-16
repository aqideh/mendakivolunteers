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
              <KRadio
                className="volunteer-review-rating"
                key={option.value}
                label={(
                  <span>
                    <span className="volunteer-review-stars" aria-hidden="true">{option.stars}</span>{" "}
                    <span>{option.label}</span>
                  </span>
                )}
                name="rating"
                required
                value={String(option.value)}
              />
            ))}
          </div>
        </fieldset>

        <fieldset className="volunteer-review-fieldset">
          <legend>Positive behaviours <span className="muted">optional</span></legend>
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
          <legend>Behaviours of concern <span className="muted">optional</span></legend>
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
          placeholder="Record factual context or an example of the behaviour observed."
          rows={3}
        />

        <KCheckbox
          className="volunteer-review-follow-up"
          label={(
            <span>
              <strong>Requires staff follow-up</strong>
              <small>Use for something that should be discussed or acted on. A low rating alone does not create a follow-up.</small>
            </span>
          )}
          name="followUpRequired"
        />

        <div className="phaseone-inline-insight-actions">
          <KButton type="submit">Save review</KButton>
          <small className="muted">Submitting again updates your review for this volunteer at this event.</small>
        </div>
      </form>
    </details>
  );
}
