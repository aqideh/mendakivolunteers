import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requirePathwayManager } from "@/lib/auth/pathway-access";
import { isUuid } from "@/lib/content/identifiers";
import {
  getPathwayMapRecord,
  getPathwayMapVersion,
} from "@/lib/pathways/data";
import { PathwaysView } from "@/app/pathways/pathways-view";

export const metadata: Metadata = {
  title: "Preview Volunteer Pathways",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PathwayPreviewPageProps = Readonly<{
  params: Promise<{ versionId: string }>;
}>;

export default async function PathwayPreviewPage({
  params,
}: PathwayPreviewPageProps) {
  const { versionId } = await params;

  if (!isUuid(versionId)) {
    notFound();
  }

  const { supabase } = await requirePathwayManager(
    `/admin/pathways/${versionId}/preview`,
  );
  const pathwayMapRecord = await getPathwayMapRecord(supabase);

  if (!pathwayMapRecord) {
    notFound();
  }

  const pathwayMap = await getPathwayMapVersion(
    supabase,
    pathwayMapRecord,
    versionId,
  );

  if (!pathwayMap) {
    notFound();
  }

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader
        status={`Pathway ${pathwayMap.status} v${pathwayMap.versionNumber}`}
        dashboard
      />
      <div className="page-frame">
        <Link className="text-link" href="/admin/pathways">
          ← Return to pathway editor
        </Link>
      </div>
      <PathwaysView pathwayMap={pathwayMap} isSignedIn preview />
    </div>
  );
}
