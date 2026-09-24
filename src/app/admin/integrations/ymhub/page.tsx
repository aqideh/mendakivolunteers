import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

import { YmHubImportForm } from "./import-form";

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
  await requireProgrammeManager("/admin/integrations/ymhub");
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
              Validate and track CSV handoffs between YM Hub and KELUARGA without keeping a separate manual log.
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
            The Batch Centre database foundation has not been applied to this environment yet. Imports and attendance handoffs remain disabled.
          </div>
        ) : null}

        <section className="dashboard-grid" aria-label="Batch Centre status">
          <article className="panel">
            <p className="eyebrow">Inbound data</p>
            <h2>{summary.committed_import_batches} committed batches</h2>
            <p className="muted">Latest committed file: {formatSingaporeDateTime(summary.latest_import_at)}</p>
            <p>Person Accounts, Volunteer Initiatives, Job Position Shifts and Job Position Assignments are imported as one validated batch.</p>
            <span className="status-pill">Importer available</span>
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
            <p className="muted">Warnings and follow-up notes are retained with the batch instead of relying on a separate spreadsheet or staff memory.</p>
            <span className="status-pill">Auditable notes</span>
          </article>

          <article className="panel">
            <p className="eyebrow">History</p>
            <h2>{summary.import_batches} inbound batches recorded</h2>
            <p className="muted">KELUARGA retains reporting periods, checksums and handoff state so duplicate report files can be detected.</p>
            <span className="status-pill">Automatic audit trail</span>
          </article>
        </section>

        <section className="panel" aria-labelledby="ymhub-import-title">
          <p className="eyebrow">Inbound YM Hub data</p>
          <h2 id="ymhub-import-title">Import four Salesforce reports</h2>
          <p className="muted">
            Export the four agreed CSV reports for the same reporting period. Preview checks required columns, accepted header aliases, formats, duplicate source IDs and cross-file references before the commit button is enabled. Additional approved source columns can be carried without breaking validation.
          </p>
          {ready ? <YmHubImportForm /> : <p>The importer will appear after the database migration is applied.</p>}
        </section>

        <section className="panel">
          <p className="eyebrow">Current integration scope</p>
          <h2>Raw Salesforce statuses preserved</h2>
          <p>
            KELUARGA does not yet translate Job Position Assignment or Volunteer Initiative statuses into a guessed lifecycle. The source values are stored unchanged until the complete YM Hub status contract is confirmed.
          </p>
        </section>
      </main>
    </div>
  );
}
