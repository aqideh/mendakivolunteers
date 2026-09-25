"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import {
  commitOpportunityWorkbook,
  previewOpportunityWorkbook,
  type OpportunityImportActionState,
} from "./actions";

const initialState: OpportunityImportActionState = {
  status: "idle",
  message: "",
};

function issueClass(severity: "error" | "warning") {
  return severity === "error" ? "notice notice-error" : "notice";
}

export function OpportunityWorkbookImportForm() {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [state, setState] = useState<OpportunityImportActionState>(initialState);
  const [pending, startTransition] = useTransition();
  const previewEvents = useMemo(() => state.preview?.events.slice(0, 50) ?? [], [state.preview]);

  function formDataForFile() {
    const formData = new FormData();
    if (file) formData.set("workbook", file);
    return formData;
  }

  function runPreview() {
    setState(initialState);
    startTransition(async () => {
      setState(await previewOpportunityWorkbook(initialState, formDataForFile()));
    });
  }

  function runCommit() {
    startTransition(async () => {
      const next = await commitOpportunityWorkbook(initialState, formDataForFile());
      setState(next);
      if (next.status === "success") router.refresh();
    });
  }

  const canCommit = Boolean(state.preview?.valid) && !pending && state.status !== "success";

  return (
    <div className="phaseone-admin-form">
      <div className="panel">
        <div className="form-field">
          <label htmlFor="opportunityWorkbook">Opportunity population workbook</label>
          <input
            accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
            id="opportunityWorkbook"
            onChange={(event) => {
              setFile(event.currentTarget.files?.[0] ?? null);
              setState(initialState);
            }}
            type="file"
          />
          <p className="muted">
            Use the Keluarga Opportunity Population Template. The importer reads the
            Opportunities and Shifts sheets and ignores Internal Notes and Row Check.
          </p>
        </div>

        <div className="actions">
          <button
            className="button button-secondary"
            disabled={!file || pending}
            onClick={runPreview}
            type="button"
          >
            {pending && state.status === "idle" ? "Validating…" : "Preview & validate"}
          </button>
          <button
            className="button button-primary"
            disabled={!canCommit}
            onClick={runCommit}
            type="button"
          >
            {pending && state.preview?.valid ? "Importing…" : "Import validated workbook"}
          </button>
        </div>
        <p className="muted">
          Preview writes nothing. Commit reparses and revalidates the workbook on the
          server, then imports the whole batch transactionally.
        </p>
      </div>

      {state.message ? (
        <div
          className={
            state.status === "success"
              ? "notice notice-success"
              : state.status === "error"
                ? "notice notice-error"
                : state.preview?.valid
                  ? "notice notice-success"
                  : "notice"
          }
          role={state.status === "error" ? "alert" : "status"}
        >
          {state.message}
          {state.batchId ? <p className="muted">Import batch: {state.batchId}</p> : null}
        </div>
      ) : null}

      {state.preview ? (
        <>
          <section className="panel">
            <div className="dashboard-header">
              <div>
                <h2>Import preview</h2>
                <p className="muted">
                  {state.preview.opportunityRows} opportunity rows · {state.preview.shiftRows} shift rows
                </p>
              </div>
              <span className="status-pill">
                {state.preview.valid
                  ? "Ready"
                  : state.preview.alreadyImported
                    ? "Already imported"
                    : "Needs changes"}
              </span>
            </div>
            <p>
              All imported programmes and their opportunity listings will start as
              <strong> unpublished drafts</strong>, even when the workbook says Yes.
              Review them in Event Operations before publishing.
            </p>
          </section>

          {state.preview.issues.length > 0 ? (
            <section>
              <h2>Validation notes</h2>
              <div className="phaseone-admin-form">
                {state.preview.issues.slice(0, 60).map((issue, index) => (
                  <div
                    className={issueClass(issue.severity)}
                    key={`${issue.code}-${issue.sheet}-${issue.row ?? "workbook"}-${index}`}
                  >
                    <strong>
                      {issue.severity.toUpperCase()} · {issue.sheet}
                      {issue.row ? ` row ${issue.row}` : ""}
                    </strong>
                    <p>{issue.message}</p>
                    <code>{issue.code}</code>
                  </div>
                ))}
              </div>
              {state.preview.issues.length > 60 ? (
                <p className="muted">Showing the first 60 validation notes.</p>
              ) : null}
            </section>
          ) : null}

          {previewEvents.length > 0 ? (
            <section>
              <h2>Programmes in workbook</h2>
              <div className="table-wrap">
                <table className="content-table">
                  <thead>
                    <tr>
                      <th>Row</th>
                      <th>Programme</th>
                      <th>Slug</th>
                      <th>Shifts</th>
                      <th>Workbook publication</th>
                      <th>Import state</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewEvents.map((event) => (
                      <tr key={`${event.sourceRow}-${event.opportunityKey}`}>
                        <td>{event.sourceRow}</td>
                        <td>
                          <strong>{event.title || "Untitled"}</strong>
                          <span className="table-subtext">{event.opportunityKey}</span>
                        </td>
                        <td><code>{event.slug || "—"}</code></td>
                        <td>{event.timeslots.length}</td>
                        <td>{event.requestedOpportunityPublish ? "Yes" : "No"}</td>
                        <td>Draft</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {state.preview.events.length > previewEvents.length ? (
                <p className="muted">
                  Showing the first {previewEvents.length} of {state.preview.events.length} programmes.
                </p>
              ) : null}
            </section>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
