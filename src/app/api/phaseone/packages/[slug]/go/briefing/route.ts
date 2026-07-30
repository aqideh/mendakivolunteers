import { NextRequest, NextResponse } from "next/server";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { evaluateBriefingAccess } from "@/lib/phaseone/package-briefing";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const supabase = getPhaseOneAdminClient();
  const { data: volunteerPackage, error } = await supabase
    .from("phaseone_events")
    .select("is_published, briefing_url, briefing_available_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load package briefing", { code: error.code, slug });
    return NextResponse.json({ error: "Briefing access is unavailable." }, { status: 500 });
  }

  const decision = evaluateBriefingAccess({
    isPublished: volunteerPackage?.is_published ?? false,
    briefingUrl: volunteerPackage?.briefing_url ?? null,
    briefingAvailableAt: volunteerPackage?.briefing_available_at ?? null,
  });

  if (!decision.available) {
    return NextResponse.json({ error: "Briefing not started." }, { status: 404 });
  }

  return NextResponse.redirect(decision.destination);
}
