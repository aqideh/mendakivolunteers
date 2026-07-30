import { NextRequest, NextResponse } from "next/server";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { evaluateBriefingAccess } from "@/lib/phaseone/package-briefing";
import { packagePrivateResponseHeaders } from "@/lib/phaseone/package-route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(body: object, status: number) {
  return NextResponse.json(body, {
    status,
    headers: packagePrivateResponseHeaders,
  });
}

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
    return json({ error: "Briefing access is unavailable." }, 500);
  }

  const decision = evaluateBriefingAccess({
    isPublished: volunteerPackage?.is_published ?? false,
    briefingUrl: volunteerPackage?.briefing_url ?? null,
    briefingAvailableAt: volunteerPackage?.briefing_available_at ?? null,
  });

  if (!decision.available) {
    return json({ error: "Briefing not started." }, 404);
  }

  const response = NextResponse.redirect(decision.destination);
  for (const [name, value] of Object.entries(packagePrivateResponseHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}
