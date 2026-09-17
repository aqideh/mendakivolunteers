import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "YM Hub Batch Centre" };
export const dynamic = "force-dynamic";

type BatchSummary = Readonly<{
  import_batches: number;
  committed_import_batches: number;
  open_import_exceptions: number;
  export_batches: number;
  pending_export_batches: number;
  latest_import_at: string | null;
  latest_export_at: string | null;
}>;

const emptySummary: BatchSummary = {
  import_batches: 0,
  committed_import_batches: 0,
  open_import_exceptions: 0,
  export_batches: 0,
  pending_export_batches: 0,
  latest_import_at: null,
  latest_export_at: null,
};

function formatSingaporeDateTime(value: string | null): string {
  if (!value) return "Not yet";

  return new Intl.DateTimeFormat("en-SG", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "Asia/Singapore",
  }).format(new Date(value));
}

function readSummary(value: unknown): BatchSummary {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return emptySummary;
  }

  const row = value as Record<string, unknown>;
  const number = (key: keyof BatchSummary) =>
    typeof row[key] === "number" ? (row[key] as number) : 0;
  const timestamp = (key: keyof BatchSummary) =>
    typeof row[key] === "string" ? (row[key] as string) : null;

  return {
    import_batches: number("import_batches"),
    committed_import_batches: number("committed_import_batches"),
    open_import_exceptions: number("open_import_exceptions"),
    export_batches: number("export_batches"),
    pending_export_batches: number("pending_export_batches"),
    latest_import_at: timestamp("latest_import_at"),
    latest_export_at: timestamp("latest_export_at"),
  };
}

export default async function YmHubBatchCentrePage() {
  await requireEventManager("/admin/integrations/ymhub");
  const admin = getPhaseOneAdminClient();
  const summaryResult = await admin.schema("core").rpc("get_ymhub_batch_summary");
  const ready = !summaryResult.error;

  if (summaryResult.error) {
    console.warn("YM Hub Batch Centre database foundation is not available", {
      code: summaryResult.error.code,
    });
  }

  const summary = ready ? readSummary(summaryResult.data) : emptySummary;

  return (
    <div className="site-shell">
      <PortalHeader status="YM Hub Batch Centre" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Staff integration operations</p>
            <h1>YM Hub Batch Centre</h1>
            <p className="muted">
              Track CSV handoffs between YM Hub and KELUARGA without keeping a separate manual log.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/events">
              Event operations
            </Link>
          </div>
        </div>

        {!ready ? (
          <div className="notice" role="status">
            The Batch Centre database foundation has not been applied to this environment yet. The page is safe to preview, but imports and attendance handoffs remain disabled.
          </div>
        ) : null}

        <section className="dashboard-grid" aria-label="Batch Centre status">
          <article className="panel">
            <p className="eyebrow">Inbound data</p>
            <h2>{summary.committed_import_batches} committed batches</h2>
            <p className="muted">Latest committed file: {formatSingaporeDateTime(summary.latest_import_at)}</p>
            <p>
              Person Accounts, Volunteer Initiatives, Job Position Shifts and Job Position Assignments will be validated and recorded here.
            </p>
            <span className="status-pill">Importer next</span>
          </article>

          <article className="panel">
            <p className="eyebrow">Attendance handoff</p>
            <h2>{summary.export_batches} export batches</h2>
            <p className="muted">Latest generated file: {formatSingaporeDateTime(summary.latest_export_at)}</p>
            <p>{summary.pending_export_batches} generated or handed-off batches are awaiting final confirmation.</p>
            <span className="status-pill">Export workflow next</span>
          </article>

          <article className="panel">
            <p className="eyebrow">Exceptions</p>
            <h2>{summary.open_import_exceptions} open</h2>
            <p className="muted">
              Invalid relationships, unknown statuses and unresolved records will be surfaced here rather than silently coerced.
            </p>
            <span className="status-pill">No hidden failures</span>
          </article>

          <article className="panel">
            <p className="eyebrow">History</p>
            <h2>{summary.import_batches} inbound batches recorded</h2>
            <p className="muted">
              KELUARGA will retain periods, checksums and handoff state so staff do not need to remember what was already processed.
            </p>
            <span className="status-pill">Automatic audit trail</span>
          </article>
        </section>

        <section className="panel">
          <div className="dashboard-header">
            <div>
              <p className="eyebrow">Current integration scope</p>
              <h2>Foundation only</h2>
            </div>
          </div>
          <p>
            CSV headers and Salesforce status mappings are intentionally not hard-coded yet. They will be added after the remaining YM Hub report contract items are confirmed.
          </p>
        </section>
      </main>
    </div>
  );
}
