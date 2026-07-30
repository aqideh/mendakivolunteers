import { NextRequest, NextResponse } from "next/server";

import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import {
  getPackageActionDestination,
  getPackageActionPin,
  hasPackageActionAccess,
  isPackageAction,
  isSafePackageActionDestination,
  packageActionCookieName,
  readPackageActionAccessToken,
} from "@/lib/phaseone/package-action-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action: rawAction } = await context.params;
  if (!isPackageAction(rawAction)) {
    return NextResponse.json({ error: "Unknown package action." }, { status: 404 });
  }

  const supabase = getPhaseOneAdminClient();
  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, sign_in_url, sign_out_url, sign_in_pin_salt, sign_in_pin_hash, sign_in_pin_updated_at, sign_out_pin_salt, sign_out_pin_hash, sign_out_pin_updated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  const configuredPin = event ? getPackageActionPin(event, rawAction) : null;
  if (error || !event || !configuredPin) {
    return NextResponse.redirect(new URL(`/packages/${slug}?access=unavailable&action=${rawAction}`, request.url));
  }

  const claims = readPackageActionAccessToken(
    request.cookies.get(packageActionCookieName(event.id, rawAction))?.value,
    getPhaseOneServerSecret(),
  );
  if (!hasPackageActionAccess(claims, event.id, rawAction, configuredPin.updatedAt)) {
    return NextResponse.redirect(new URL(`/packages/${slug}?access=expired&action=${rawAction}`, request.url));
  }

  const destination = getPackageActionDestination(event, rawAction);
  if (!isSafePackageActionDestination(destination)) {
    return NextResponse.redirect(new URL(`/packages/${slug}?access=unavailable&action=${rawAction}`, request.url));
  }

  return NextResponse.redirect(destination);
}
