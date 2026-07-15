import Link from "next/link";

import { toSingaporeDateTimeLocal } from "@/lib/content/dates";
import type { ContentStatus, Database } from "@/types/database";

type Opportunity = Database["content"]["Tables"]["opportunities"]["Row"];
type FormAction = (formData: FormData) => Promise<void>;

type OpportunityFormProps = {
  action: FormAction;
  opportunity?: Opportunity;
  canPublish: boolean;
  error: string | undefined;
};

const editorStatuses: ContentStatus[] = ["draft", "in_review"];
const publisherStatuses: ContentStatus[] = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "archived",
];

export function OpportunityForm({
  action,
  opportunity,
  canPublish,
  error,
}: OpportunityFormProps) {
  const statuses = canPublish ? publisherStatuses : editorStatuses;
  const currentStatus = opportunity?.status ?? "draft";

  return (
    <form action={action} className="cms-form">
      {opportunity ? <input name="id" type="hidden" value={opportunity.id} /> : null}

      {error ? (
        <div className="notice notice-error" role="alert">
          {error}
        </div>
      ) : null}

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Title</span>
          <input
            name="title"
            required
            minLength={5}
            maxLength={140}
            defaultValue={opportunity?.title ?? ""}
          />
        </label>

        <label className="form-field">
          <span>Slug</span>
          <input
            name="slug"
            required
            minLength={3}
            maxLength={160}
            pattern="[a-z0-9]+(-[a-z0-9]+)*"
            defaultValue={opportunity?.slug ?? ""}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Summary</span>
        <textarea
          name="summary"
          required
          minLength={10}
          maxLength={400}
          rows={3}
          defaultValue={opportunity?.summary ?? ""}
        />
      </label>

      <label className="form-field">
        <span>Description</span>
        <textarea
          name="body"
          required
          minLength={20}
          maxLength={20_000}
          rows={10}
          defaultValue={opportunity?.body ?? ""}
        />
      </label>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Category</span>
          <input
            name="category"
            required
            minLength={2}
            maxLength={80}
            defaultValue={opportunity?.category ?? ""}
          />
        </label>

        <label className="form-field">
          <span>Location</span>
          <input
            name="locationName"
            maxLength={180}
            defaultValue={opportunity?.location_name ?? ""}
          />
        </label>
      </div>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Starts at (Singapore time)</span>
          <input
            name="startsAt"
            type="datetime-local"
            required
            defaultValue={toSingaporeDateTimeLocal(opportunity?.starts_at ?? null)}
          />
        </label>

        <label className="form-field">
          <span>Ends at (Singapore time)</span>
          <input
            name="endsAt"
            type="datetime-local"
            defaultValue={toSingaporeDateTimeLocal(opportunity?.ends_at ?? null)}
          />
        </label>
      </div>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Registration deadline (Singapore time)</span>
          <input
            name="registrationDeadline"
            type="datetime-local"
            defaultValue={toSingaporeDateTimeLocal(
              opportunity?.registration_deadline ?? null,
            )}
          />
        </label>

        <label className="form-field">
          <span>Optional YM Hub activity ID</span>
          <input
            name="ymhubActivityId"
            maxLength={128}
            defaultValue={opportunity?.ymhub_activity_id ?? ""}
          />
        </label>
      </div>

      <label className="form-field">
        <span>YM Hub registration URL</span>
        <input
          name="registrationUrl"
          type="url"
          required
          maxLength={2048}
          defaultValue={opportunity?.registration_url ?? "https://"}
        />
        <span className="form-help">
          The portal lists the opportunity only. Registration remains a YM Hub
          link-out.
        </span>
      </label>

      <div className="form-grid two-column">
        <label className="form-field">
          <span>Status</span>
          <select name="status" defaultValue={currentStatus}>
            {statuses.map((status) => (
              <option key={status} value={status}>
                {status.replace("_", " ")}
              </option>
            ))}
          </select>
        </label>

        <label className="form-field">
          <span>Publish at (Singapore time)</span>
          <input
            name="publishAt"
            type="datetime-local"
            defaultValue={toSingaporeDateTimeLocal(opportunity?.publish_at ?? null)}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Expires at (Singapore time)</span>
        <input
          name="expiresAt"
          type="datetime-local"
          defaultValue={toSingaporeDateTimeLocal(opportunity?.expires_at ?? null)}
        />
      </label>

      <div className="checkbox-row">
        <label>
          <input
            name="featured"
            type="checkbox"
            defaultChecked={opportunity?.featured ?? false}
          />
          <span>Feature this listing</span>
        </label>
        <label>
          <input
            name="isRemote"
            type="checkbox"
            defaultChecked={opportunity?.is_remote ?? false}
          />
          <span>Online opportunity</span>
        </label>
      </div>

      {!canPublish ? (
        <p className="form-help">
          Your role can save drafts and send items for review. Scheduling,
          publishing, and archiving require publisher access.
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit">
          Save opportunity
        </button>
        <Link className="button button-secondary" href="/admin/content">
          Cancel
        </Link>
      </div>
    </form>
  );
}
