import type { Metadata } from "next";
import Link from "next/link";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PortalHeader } from "@/components/portal-header";
import { getPublishedPathwayMap } from "@/lib/pathways/data";
import { createClient } from "@/lib/supabase/server";

import { PathwaysView } from "./pathways-view";

export const metadata: Metadata = {
  title: "My Volunteer Pathways",
  description:
    "Explore potential MENDAKI volunteering pathways and see how roles can develop over time.",
};

export const dynamic = "force-dynamic";

export default async function PathwaysPage() {
  const supabase = await createClient();
  const [pathwayMap, claimsResult] = await Promise.all([
    getPublishedPathwayMap(supabase),
    supabase.auth.getClaims(),
  ]);
  const { data: claimsData, error: claimsError } = claimsResult;
  const isSignedIn = !claimsError && Boolean(claimsData?.claims?.sub);
  let currentStageKeys: string[] = [];

  if (isSignedIn && pathwayMap) {
    const client = supabase as unknown as SupabaseClient;
    const { data: pathwaySnapshot, error: positionsError } = await client
      .schema("core")
      .rpc("get_current_pathway_positions_snapshot");

    if (positionsError) {
      console.error("Unable to load personal pathway positions", {
        code: positionsError.code,
      });
      throw new Error("Personal pathway positions could not be loaded");
    }

    const positions =
      (pathwaySnapshot as {
        positions?: Array<{ map_id: string; stage_stable_key: string }>;
      } | null)?.positions ?? [];

    currentStageKeys = positions
      .filter(({ map_id }) => map_id === pathwayMap.mapId)
      .map(({ stage_stable_key }) => stage_stable_key);
  }

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer pathways" lite />
      {pathwayMap ? (
        <PathwaysView
          pathwayMap={pathwayMap}
          isSignedIn={isSignedIn}
          currentStageKeys={currentStageKeys}
        />
      ) : (
        <main className="page-frame">
          <section className="panel" aria-labelledby="pathways-unavailable-title">
            <p className="eyebrow">Volunteer pathways</p>
            <h1 id="pathways-unavailable-title">Pathways are being updated.</h1>
            <p className="muted">
              No pathway map is currently published. Existing volunteer services
              remain available.
            </p>
            <Link className="button button-primary" href="/opportunities">
              Browse opportunities
            </Link>
          </section>
        </main>
      )}
    </div>
  );
}
