import Link from "next/link";

import {
  formatSingaporeDateTime,
  toSingaporeDateTimeLocal,
} from "@/lib/content/dates";

export type ImportedOpportunityForOverride = Readonly<{
  id: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_text: string | null;
  venue: string | null;
}>;

export type OpportunityOverrideForForm = Readonly<{
  external_opportunity_id: string;
  title: string | null;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  schedule_text: string | null;
  venue: string | null;
  is_visible: boolean;
  sort_order: number | null;
}>;

type FormAction = (formData: FormData) => Promise<void>;

type OpportunityOverrideFormProps = {
  opportunity: ImportedOpportunityForOverride;
  override: OpportunityOverrideForForm | null;
  saveAction: FormAction;
  resetAction: FormAction;
  error: string | undefined;
};

function importedValue(value: string | null): string {
  return value?.trim() || "Not set";
}

export function OpportunityOverrideForm({
  opportunity,
  override,
  saveAction,
  resetAction,
  error,
}: OpportunityOverrideFormProps) {
  return (
    <div>
      <form action={saveAction} className="cms-form">
        <input name="id" type="hidden" value={opportunity.id} />

        {error ? (
          <div className="notice notice-error" role="alert">
            {error}
          </div>
        ) : null}

        <div className="notice">
          Leave an override field blank to keep using the imported value. Visibility
          and card order are app-managed settings.
        </div>

        <label className="form-field">
          <span>Title override</span>
          <input
            name="title"
            maxLength={140}
            defaultValue={override?.title ?? ""}
            placeholder={opportunity.title}
          />
          <span className="form-help">Imported: {opportunity.title}</span>
        </label>

        <label className="form-field">
          <span>Summary override</span>
          <textarea
            name="summary"
            maxLength={400}
            rows={4}
            defaultValue={override?.summary ?? ""}
            placeholder={opportunity.summary ?? "No imported summary"}
          />
          <span className="form-help">
            Imported: {importedValue(opportunity.summary)}
          </span>
        </label>

        <label className="form-field">
          <span>Image URL override</span>
          <input
            name="imageUrl"
            type="url"
            maxLength={2048}
            defaultValue={override?.image_url ?? ""}
            placeholder={opportunity.image_url ?? "https://"}
          />
          <span className="form-help">
            Imported: {importedValue(opportunity.image_url)}
          </span>
        </label>

        <div className="form-grid two-column">
          <label className="form-field">
            <span>Start override (Singapore time)</span>
            <input
              name="startsAt"
              type="datetime-local"
              defaultValue={toSingaporeDateTimeLocal(override?.starts_at ?? null)}
            />
            <span className="form-help">
              Imported: {formatSingaporeDateTime(opportunity.starts_at)}
            </span>
          </label>

          <label className="form-field">
            <span>End override (Singapore time)</span>
            <input
              name="endsAt"
              type="datetime-local"
              defaultValue={toSingaporeDateTimeLocal(override?.ends_at ?? null)}
            />
            <span className="form-help">
              Imported: {formatSingaporeDateTime(opportunity.ends_at)}
            </span>
          </label>
        </div>

        <div className="form-grid two-column">
          <label className="form-field">
            <span>Schedule override</span>
            <input
              name="scheduleText"
              maxLength={100}
              defaultValue={override?.schedule_text ?? ""}
              placeholder={opportunity.schedule_text ?? "e.g. 9:00 AM - 1:00 PM"}
            />
            <span className="form-help">
              Imported: {importedValue(opportunity.schedule_text)}
            </span>
          </label>

          <label className="form-field">
            <span>Venue override</span>
            <input
              name="venue"
              maxLength={180}
              defaultValue={override?.venue ?? ""}
              placeholder={opportunity.venue ?? "Venue"}
            />
            <span className="form-help">
              Imported: {importedValue(opportunity.venue)}
            </span>
          </label>
        </div>

        <div className="form-grid two-column">
          <label className="form-field">
            <span>Card order</span>
            <input
              name="sortOrder"
              type="number"
              min={0}
              max={9999}
              step={1}
              defaultValue={override?.sort_order ?? ""}
              placeholder="Default"
            />
            <span className="form-help">
              Lower numbers appear first. Leave blank for the default ordering.
            </span>
          </label>

          <div className="form-field">
            <span>Visibility</span>
            <label className="checkbox-row">
              <input
                name="isVisible"
                type="checkbox"
                defaultChecked={override?.is_visible ?? true}
              />
              <span>Show this card on the public Opportunities page</span>
            </label>
          </div>
        </div>

        <div className="form-actions">
          <button className="button button-primary" type="submit">
            Save card overrides
          </button>
          <Link className="button button-secondary" href="/admin/content#opportunities">
            Cancel
          </Link>
        </div>
      </form>

      {override ? (
        <form action={resetAction} className="cms-form">
          <input name="id" type="hidden" value={opportunity.id} />
          <div className="form-actions">
            <button className="button button-secondary" type="submit">
              Reset all card overrides
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}
