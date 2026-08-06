import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requirePathwayManager } from "@/lib/auth/pathway-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import {
  getPathwayMapRecord,
  getPathwayMapVersion,
} from "@/lib/pathways/data";

import { createPathwayDraft, publishPathwayDraft } from "./actions";
import { PathwayEditor } from "./pathway-editor";

export const metadata: Metadata = {
  title: "Manage Volunteer Pathways",
};

export const dynamic = "force-dynamic";

type AdminPathwaysPageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

const successMessages: Record<string, string> = {
  draft_created: "A new draft was created from the published pathway map.",
  draft_saved: "The pathway draft was saved. The published map is unchanged.",
  draft_published: "The pathway draft is now published for volunteers.",
};

function readParameter(
  parameters: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined {
  const value = parameters[name];
  return Array.isArray(value) ? value[0] : value;
}

export default async function AdminPathwaysPage({
  searchParams,
}: AdminPathwaysPageProps) {
  const { supabase } = await requirePathwayManager();
  const pathwayMap = await getPathwayMapRecord(supabase);

  if (!pathwayMap) {
    throw new Error("The default pathway map is missing");
  }

  const { data: versions, error: versionsError } = await supabase
    .schema("pathways")
    .from("map_versions")
    .select(
      "id, map_id, version_number, status, name, introduction, explorer_title, explorer_description, footer_note, created_by, published_by, published_at, created_at, updated_at",
    )
    .eq("map_id", pathwayMap.id)
    .order("version_number", { ascending: false });

  if (versionsError || !versions) {
    console.error("Unable to load pathway version history", {
      mapId: pathwayMap.id,
      code: versionsError?.code,
    });
    throw new Error("Pathway version history could not be loaded");
  }

  const draftRecord = versions.find(({ status }) => status === "draft");
  const draft = draftRecord
    ? await getPathwayMapVersion(supabase, pathwayMap, draftRecord.id)
    : null;
  const parameters = await searchParams;
  const successCode = readParameter(parameters, "success");
  const successMessage = successCode ? successMessages[successCode] : undefined;
  const errorMessage = readParameter(parameters, "error");

  return (
    <div className="site-shell">
      <PortalHeader status="Pathway management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">Volunteer development</p>
            <h1>Manage volunteer pathways</h1>
            <p className="muted">
              Edit a complete draft, preview it using the volunteer interface, and
              publish the version atomically when it is ready.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/pathways" target="_blank">
              View published map
            </Link>
            {draft ? (
              <Link
                className="button button-secondary"
                href={`/admin/pathways/${draft.versionId}/preview`}
                target="_blank"
              >
                Preview draft
              </Link>
            ) : null}
          </div>
        </div>

        {successMessage ? (
          <div className="notice notice-success" role="status">
            {successMessage}
          </div>
        ) : null}
        {errorMessage ? (
          <div className="notice notice-error" role="alert">
            {errorMessage}
          </div>
        ) : null}

        <section className="panel" aria-labelledby="pathway-publishing-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Publishing control</p>
              <h2 id="pathway-publishing-title">Current version</h2>
            </div>
            {draft ? (
              <form action={publishPathwayDraft}>
                <input name="versionId" type="hidden" value={draft.versionId} />
                <button className="button button-primary" type="submit">
                  Publish saved draft
                </button>
              </form>
            ) : (
              <form action={createPathwayDraft}>
                <input name="mapId" type="hidden" value={pathwayMap.id} />
                <button className="button button-primary" type="submit">
                  Create editable draft
                </button>
              </form>
            )}
          </div>
          <p className="muted">
            {draft
              ? `Draft version ${draft.versionNumber} is available. Saving it does not change the volunteer-facing map.`
              : "No draft is open. Create one from the current published version before editing."}
          </p>
        </section>

        {draft ? <PathwayEditor pathwayMap={draft} /> : null}

        <section className="section" aria-labelledby="pathway-history-title">
          <div className="section-header">
            <div>
              <p className="eyebrow">Audit trail</p>
              <h2 id="pathway-history-title">Version history</h2>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th scope="col">Version</th>
                  <th scope="col">Status</th>
                  <th scope="col">Updated</th>
                  <th scope="col">Published</th>
                  <th scope="col">Preview</th>
                </tr>
              </thead>
              <tbody>
                {versions.map((version) => (
                  <tr key={version.id}>
                    <td>
                      <strong>Version {version.version_number}</strong>
                      <span className="table-subtext">{version.name}</span>
                    </td>
                    <td>
                      <span className="status-pill" data-state={version.status}>
                        {version.status}
                      </span>
                    </td>
                    <td>{formatSingaporeDateTime(version.updated_at)}</td>
                    <td>
                      {version.published_at
                        ? formatSingaporeDateTime(version.published_at)
                        : "Not published"}
                    </td>
                    <td>
                      <Link
                        className="text-link"
                        href={`/admin/pathways/${version.id}/preview`}
                        target="_blank"
                      >
                        Preview version
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      </main>
      <footer className="site-footer">MENDAKI Volunteer Pathway Management</footer>
    </div>
  );
}
