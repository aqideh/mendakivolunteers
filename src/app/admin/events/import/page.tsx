import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireProgrammeManager } from "@/lib/auth/event-access";

import { OpportunityWorkbookImportForm } from "./import-form";

export const metadata: Metadata = { title: "Import programmes" };
export const dynamic = "force-dynamic";

export default async function OpportunityImportPage() {
  await requireProgrammeManager("/admin/events/import");

  return (
    <div className="site-shell">
      <PortalHeader status="Import programmes" dashboard />
      <main className="page-frame narrow-frame">
        <section className="page-intro">
          <h1>Import programmes from Excel</h1>
          <p className="lede">
            Upload the Keluarga opportunity population template, validate it, then
            create programme and shift drafts in one transaction.
          </p>
          <div className="actions">
            <Link className="button button-secondary" href="/admin/events">
              Back to programmes
            </Link>
          </div>
        </section>

        <div className="notice">
          <strong>Review before publishing</strong>
          <p>
            Excel imports never publish Event Guides or opportunity listings automatically.
            The workbook&apos;s publication column is retained for review, but every imported
            record starts as a draft.
          </p>
        </div>

        <OpportunityWorkbookImportForm />
      </main>
    </div>
  );
}
