"use client";

import { useActionState, useState } from "react";

import {
  parseYmHubImportFiles,
  ymHubDatasetDefinitions,
  ymHubDatasetKeys,
  ymHubImportMaxFileBytes,
  ymHubImportMaxTotalBytes,
  type YmHubDatasetKey,
  type YmHubImportFiles,
  type YmHubParsedImport,
} from "@/lib/ymhub/importer";

import { commitYmHubImportBatch, type YmHubImportActionState } from "./actions";
import styles from "./ymhub-batch.module.css";

const initialState: YmHubImportActionState = { status: "idle", message: "" };

async function sha256(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function YmHubImportForm() {
  const [state, formAction, pending] = useActionState(commitYmHubImportBatch, initialState);
  const [preview, setPreview] = useState<YmHubParsedImport | null>(null);
  const [previewMessage, setPreviewMessage] = useState<string>("");
  const [selected, setSelected] = useState<Partial<Record<YmHubDatasetKey, File>>>({});

  async function previewFiles() {
    const missing = ymHubDatasetKeys.find((key) => !selected[key]);
    if (missing) {
      setPreview(null);
      setPreviewMessage(`Select the ${ymHubDatasetDefinitions[missing].label} CSV.`);
      return;
    }
    const files = ymHubDatasetKeys.map((key) => selected[key] as File);
    if (files.some((file) => file.size > ymHubImportMaxFileBytes)) {
      setPreview(null);
      setPreviewMessage("Each CSV must be 2 MB or smaller.");
      return;
    }
    if (files.reduce((sum, file) => sum + file.size, 0) > ymHubImportMaxTotalBytes) {
      setPreview(null);
      setPreviewMessage("The four CSV files together must be 3.5 MB or smaller.");
      return;
    }

    try {
      const entries = await Promise.all(
        ymHubDatasetKeys.map(async (key) => {
          const file = selected[key] as File;
          return [key, { fileName: file.name, sha256: await sha256(file), text: await file.text() }] as const;
        }),
      );
      const importFiles = Object.fromEntries(entries) as YmHubImportFiles;
      const parsed = parseYmHubImportFiles(importFiles);
      setPreview(parsed);
      setPreviewMessage(parsed.valid ? "Preview passed. Review the counts below, then commit the batch." : "Preview found blocking errors. Nothing has been imported.");
    } catch {
      setPreview(null);
      setPreviewMessage("The files could not be previewed. Re-export the reports as CSV and try again.");
    }
  }

  const effectiveIssues = state.status === "error" && state.issues ? state.issues : preview?.issues ?? [];
  const effectiveDatasets = state.status === "success" && state.datasets ? state.datasets : preview?.datasets ?? [];
  const canCommit = Boolean(preview?.valid) && !pending;

  return (
    <form action={formAction} className={styles.form}>
      <div className={styles.periodGrid}>
        <label>
          <span>Reporting period start</span>
          <input name="periodStart" required type="date" />
        </label>
        <label>
          <span>Reporting period end</span>
          <input name="periodEnd" required type="date" />
        </label>
      </div>

      <div className={styles.fileGrid}>
        {ymHubDatasetKeys.map((key) => (
          <label className={styles.fileField} key={key}>
            <span>{ymHubDatasetDefinitions[key].label}</span>
            <small>{ymHubDatasetDefinitions[key].headers.join(" · ")}</small>
            <input
              accept=".csv,text/csv"
              name={key}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                setSelected((current) => ({ ...current, [key]: file }));
                setPreview(null);
                setPreviewMessage("");
              }}
              required
              type="file"
            />
          </label>
        ))}
      </div>

      {previewMessage ? (
        <div className={`notice ${preview?.valid ? "notice-success" : preview ? "notice-error" : ""}`} role="status">
          {previewMessage}
        </div>
      ) : null}
      {state.status !== "idle" ? (
        <div className={`notice ${state.status === "success" ? "notice-success" : "notice-error"}`} role={state.status === "error" ? "alert" : "status"}>
          {state.message}
          {state.batchId ? <span className={styles.batchId}>Batch {state.batchId}</span> : null}
        </div>
      ) : null}

      {effectiveDatasets.length > 0 ? (
        <div className={styles.previewTable}>
          <table className="content-table">
            <thead><tr><th>Dataset</th><th>Rows</th><th>Will import</th><th>Skipped</th><th>Checksum</th></tr></thead>
            <tbody>
              {effectiveDatasets.map((dataset) => (
                <tr key={dataset.dataset}>
                  <td><strong>{dataset.label}</strong><span className="table-subtext">{dataset.fileName}</span></td>
                  <td>{dataset.rowCount}</td>
                  <td>{dataset.importedRowCount}</td>
                  <td>{dataset.skippedRowCount}</td>
                  <td><code>{dataset.sha256.slice(0, 12)}…</code></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {effectiveIssues.length > 0 ? (
        <div className={styles.issueList}>
          <h3>Validation notes</h3>
          {effectiveIssues.slice(0, 50).map((item, index) => (
            <div className={styles.issue} data-severity={item.severity} key={`${item.code}-${item.row ?? "batch"}-${index}`}>
              <strong>{item.severity.toUpperCase()} · {item.code}</strong>
              <span>{item.dataset ? `${ymHubDatasetDefinitions[item.dataset].label}${item.row ? ` row ${item.row}` : ""}: ` : ""}{item.message}</span>
            </div>
          ))}
          {effectiveIssues.length > 50 ? <p className="muted">Showing the first 50 validation notes.</p> : null}
        </div>
      ) : null}

      <div className={styles.actions}>
        <button className="button button-secondary" onClick={previewFiles} type="button">Preview & validate</button>
        <button className="button button-primary" disabled={!canCommit} type="submit">
          {pending ? "Committing…" : "Commit validated batch"}
        </button>
      </div>
      <p className="muted">Nothing is written during preview. Commit reparses and revalidates the uploaded files on the server before the atomic database transaction runs.</p>
    </form>
  );
}
