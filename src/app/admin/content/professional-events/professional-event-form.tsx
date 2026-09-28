import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

import {
  createProfessionalEvent,
  deleteProfessionalEvent,
  updateProfessionalEvent,
} from "./actions";

export type ProfessionalEventAdminValue = Readonly<{
  id: string;
  title: string;
  summary: string;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  cta_label: string;
  is_published: boolean;
  sort_order: number;
}>;

export function ProfessionalEventForm({
  event,
}: {
  event?: ProfessionalEventAdminValue;
}) {
  const action = event ? updateProfessionalEvent : createProfessionalEvent;

  return (
    <form action={action} className="cms-form">
      {event ? <input type="hidden" name="id" value={event.id} /> : null}

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Event title</span>
          <input
            name="title"
            required
            minLength={3}
            maxLength={140}
            defaultValue={event?.title ?? ""}
          />
        </label>
        <label className="form-field">
          <span>Venue</span>
          <input
            name="venue"
            minLength={2}
            maxLength={180}
            defaultValue={event?.venue ?? ""}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Summary</span>
        <textarea
          name="summary"
          required
          minLength={10}
          maxLength={600}
          rows={4}
          defaultValue={event?.summary ?? ""}
        />
      </label>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Starts (Singapore time)</span>
          <input
            name="startsAt"
            type="datetime-local"
            defaultValue={toSingaporeDateTimeLocal(event?.starts_at ?? null)}
          />
        </label>
        <label className="form-field">
          <span>Ends (Singapore time)</span>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toSingaporeDateTimeLocal(event?.ends_at ?? null)}
          />
        </label>
      </div>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>CTA label</span>
          <input
            name="ctaLabel"
            required
            minLength={2}
            maxLength={40}
            defaultValue={event?.cta_label ?? "Register"}
          />
        </label>
        <label className="form-field">
          <span>Sort order</span>
          <input
            name="sortOrder"
            type="number"
            min={-1000}
            max={1000}
            step={1}
            defaultValue={event?.sort_order ?? 0}
          />
        </label>
      </div>

      <div className="checkbox-row">
        <label>
          <input
            name="isPublished"
            type="checkbox"
            defaultChecked={event?.is_published ?? false}
          />
          <span>Publish this card on the Specialist page</span>
        </label>
      </div>

      <p className="form-help">
        The public CTA is intentionally inactive. These records are not volunteer opportunities and
        do not create volunteer registrations.
      </p>

      <div className="form-actions">
        <button className="button button-primary" type="submit">
          {event ? "Save event" : "Add event"}
        </button>
      </div>

      {event ? (
        <div className="form-actions">
          <button
            className="button button-secondary"
            formAction={deleteProfessionalEvent}
            name="id"
            value={event.id}
            type="submit"
          >
            Delete event
          </button>
        </div>
      ) : null}
    </form>
  );
}
