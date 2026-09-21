import Link from "next/link";

import { toSingaporeDateTimeLocal } from "@/lib/content/dates";

type OpportunityCardValues = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_text: string | null;
  venue: string | null;
  sort_order: number | null;
  is_hidden: boolean;
  has_override: boolean;
}>;

type FormAction = (formData: FormData) => Promise<void>;

export function OpportunityCardOverrideForm({
  opportunity,
  saveAction,
  resetAction,
  error,
}: Readonly<{
  opportunity: OpportunityCardValues;
  saveAction: FormAction;
  resetAction: FormAction;
  error?: string;
}>) {
  return (
    <>
      <form action={saveAction} className="cms-form">
        <input name="opportunityId" type="hidden" value={opportunity.id} />

        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <label className="form-field">
          <span>Card title</span>
          <input
            name="title"
            required
            maxLength={180}
            defaultValue={opportunity.title}
          />
        </label>

        <label className="form-field">
          <span>Summary</span>
          <textarea
            name="summary"
            maxLength={600}
            rows={4}
            defaultValue={opportunity.summary ?? ""}
          />
        </label>

        <label className="form-field">
          <span>Image URL</span>
          <input
            name="imageUrl"
            type="url"
            maxLength={2048}
            placeholder="https://..."
            defaultValue={opportunity.image_url ?? ""}
          />
          <span className="form-help">
            Leave blank to show the MENDAKI fallback treatment.
          </span>
        </label>

        <div className="form-grid two-column">
          <label className="form-field">
            <span>Starts at (Singapore time)</span>
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={toSingaporeDateTimeLocal(opportunity.starts_at)}
            />
          </label>

          <label className="form-field">
            <span>Ends at (Singapore time)</span>
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={toSingaporeDateTimeLocal(opportunity.ends_at)}
            />
          </label>
        </div>

        <div className="form-grid two-column">
          <label className="form-field">
            <span>Schedule text</span>
            <input
              name="scheduleText"
              maxLength={160}
              placeholder="e.g. 9:00 AM - 1:00 PM"
              defaultValue={opportunity.schedule_text ?? ""}
            />
          </label>

          <label className="form-field">
            <span>Venue</span>
            <input
              name="venue"
              maxLength={240}
              defaultValue={opportunity.venue ?? ""}
            />
          </label>
        </div>

        <label className="form-field">
          <span>Sort order</span>
          <input
            name="sortOrder"
            type="number"
            min={-10000}
            max={10000}
            step={1}
            placeholder="Leave blank for date order"
            defaultValue={opportunity.sort_order ?? ""}
          />
          <span className="form-help">
            Lower numbers appear first. Cards without a manual sort order follow after them.
          </span>
        </label>

        <div className="checkbox-row">
          <label>
            <input
              name="isHidden"
              type="checkbox"
              defaultChecked={opportunity.is_hidden}
            />
            <span>Hide this opportunity from the public page</span>
          </label>
        </div>

        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Save card
          </button>
          <Link className="button button-secondary" href="/admin/content#opportunities">
            Cancel
          </Link>
        </div>
      </form>

      {opportunity.has_override ? (
        <form action={resetAction} className="cms-form">
          <input name="opportunityId" type="hidden" value={opportunity.id} />
          <div className="form-actions">
            <button className="button button-secondary" type="submit">
              Reset to imported values
            </button>
          </div>
        </form>
      ) : null}
    </>
  );
}
