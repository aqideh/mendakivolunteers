import { NextRequest, NextResponse } from "next/server";

import { authorizeEventGuideSlug } from "@/lib/phaseone/event-guide-access";
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

function redirectWithPrivateHeaders(destination: URL | string) {
  const response = NextResponse.redirect(destination);
  for (const [name, value] of Object.entries(packagePrivateResponseHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const authorization = await authorizeEventGuideSlug(slug);

  if (authorization.state === "signed_out") {
    return redirectWithPrivateHeaders(
      new URL(
        `/login?next=${encodeURIComponent(`/journey/${slug}`)}`,
        request.url,
      ),
    );
  }
  if (authorization.state === "inactive") {
    return redirectWithPrivateHeaders(
      new URL("/login?error=account_inactive", request.url),
    );
  }
  if (authorization.state === "not_registered") {
    return redirectWithPrivateHeaders(
      new URL("/journey?error=not_registered", request.url),
    );
  }
  if (authorization.state === "not_found") {
    return json({ error: "Event Guide not found." }, 404);
  }
  if (authorization.state === "unavailable") {
    return json({ error: "Briefing access is unavailable." }, 503);
  }

  const supabase = getPhaseOneAdminClient();
  const { data: volunteerEvent, error } = await supabase
    .from("phaseone_events")
    .select("is_published, briefing_url, briefing_available_at")
    .eq("id", authorization.event.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load event briefing", { code: error.code, slug });
    return json({ error: "Briefing access is unavailable." }, 500);
  }

  const decision = evaluateBriefingAccess({
    isPublished: volunteerEvent?.is_published ?? false,
    briefingUrl: volunteerEvent?.briefing_url ?? null,
    briefingAvailableAt: volunteerEvent?.briefing_available_at ?? null,
  });

  if (!decision.available) {
    return json({ error: "Briefing not started." }, 404);
  }

  return redirectWithPrivateHeaders(decision.destination);
}
