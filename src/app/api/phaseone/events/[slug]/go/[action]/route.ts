import { NextRequest, NextResponse } from "next/server";

import { authorizeEventGuideSlug } from "@/lib/phaseone/event-guide-access";
import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import {
  evaluatePackageActionRedirect,
  getPackageActionDestination,
  isPackageAction,
  packageActionCookieName,
  readPackageActionAccessToken,
} from "@/lib/phaseone/package-action-access";
import { packagePrivateResponseHeaders } from "@/lib/phaseone/package-route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function redirect(destination: URL | string) {
  const response = NextResponse.redirect(destination);
  for (const [name, value] of Object.entries(packagePrivateResponseHeaders)) {
    response.headers.set(name, value);
  }
  return response;
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action: rawAction } = await context.params;
  if (!isPackageAction(rawAction)) {
    return NextResponse.json(
      { error: "Unknown event action." },
      { status: 404, headers: packagePrivateResponseHeaders },
    );
  }

  const authorization = await authorizeEventGuideSlug(slug);
  if (authorization.state === "signed_out") {
    return redirect(
      new URL(
        `/login?next=${encodeURIComponent(`/journey/${slug}`)}`,
        request.url,
      ),
    );
  }
  if (authorization.state === "inactive") {
    return redirect(new URL("/login?error=account_inactive", request.url));
  }
  if (authorization.state === "not_registered") {
    return redirect(new URL("/journey?error=not_registered", request.url));
  }
  if (authorization.state === "not_found") {
    return NextResponse.json(
      { error: "Event Guide not found." },
      { status: 404, headers: packagePrivateResponseHeaders },
    );
  }
  if (authorization.state === "unavailable") {
    return NextResponse.json(
      { error: "Event access is unavailable." },
      { status: 503, headers: packagePrivateResponseHeaders },
    );
  }

  const supabase = getPhaseOneAdminClient();
  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, sign_in_url, sign_out_url, sign_in_pin_updated_at, sign_out_pin_updated_at",
    )
    .eq("id", authorization.event.id)
    .eq("is_published", true)
    .maybeSingle();

  const pinUpdatedAt = event
    ? rawAction === "sign-in"
      ? event.sign_in_pin_updated_at
      : event.sign_out_pin_updated_at
    : null;
  if (error || !event || !pinUpdatedAt) {
    return redirect(
      new URL(`/journey/${slug}?access=unavailable&action=${rawAction}`, request.url),
    );
  }

  const claims = readPackageActionAccessToken(
    request.cookies.get(packageActionCookieName(event.id, rawAction))?.value,
    getPhaseOneServerSecret(),
  );
  const decision = evaluatePackageActionRedirect({
    claims,
    eventId: event.id,
    action: rawAction,
    pinUpdatedAt,
    destination: getPackageActionDestination(event, rawAction),
  });

  if (decision.status !== "allowed") {
    return redirect(
      new URL(`/journey/${slug}?access=${decision.status}&action=${rawAction}`, request.url),
    );
  }

  return redirect(decision.destination);
}
