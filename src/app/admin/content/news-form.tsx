import Link from "next/link";

import { toSingaporeDateTimeLocal } from "@/lib/content/dates";
import type { ContentStatus, Database } from "@/types/database";

type NewsPost = Database["content"]["Tables"]["news_posts"]["Row"];
type FormAction = (formData: FormData) => Promise<void>;

type NewsFormProps = {
  action: FormAction;
  post?: NewsPost;
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

export function NewsForm({ action, post, canPublish, error }: NewsFormProps) {
  const statuses = canPublish ? publisherStatuses : editorStatuses;
  const currentStatus = post?.status ?? "draft";

  return (
    <form action={action} className="cms-form">
      {post ? <input name="id" type="hidden" value={post.id} /> : null}

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
            defaultValue={post?.title ?? ""}
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
            defaultValue={post?.slug ?? ""}
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
          defaultValue={post?.summary ?? ""}
        />
      </label>

      <label className="form-field">
        <span>Body</span>
        <textarea
          name="body"
          required
          minLength={20}
          maxLength={20_000}
          rows={10}
          defaultValue={post?.body ?? ""}
        />
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
            defaultValue={toSingaporeDateTimeLocal(post?.publish_at ?? null)}
          />
        </label>
      </div>

      <label className="form-field">
        <span>Expires at (Singapore time)</span>
        <input
          name="expiresAt"
          type="datetime-local"
          defaultValue={toSingaporeDateTimeLocal(post?.expires_at ?? null)}
        />
      </label>

      <div className="checkbox-row">
        <label>
          <input
            name="featured"
            type="checkbox"
            defaultChecked={post?.featured ?? false}
          />
          <span>Feature this post</span>
        </label>
      </div>

      {!canPublish ? (
        <p className="form-help">
          Your role can save drafts and send posts for review. Scheduling,
          publishing, and archiving require publisher access.
        </p>
      ) : null}

      <div className="form-actions">
        <button className="button button-primary" type="submit">
          Save news post
        </button>
        <Link className="button button-secondary" href="/admin/content">
          Cancel
        </Link>
      </div>
    </form>
  );
}
