import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import { createClientKey, verifyPin } from "@/lib/phaseone/event-access";
import {
  createPackageActionAccessToken,
  getPackageActionPin,
  isPackageAction,
  packageActionAccessMaxAge,
  packageActionAuditType,
  packageActionCookieName,
  packageActionRateLimitScope,
  type PackageActionPinRecord,
} from "@/lib/phaseone/package-action-access";
import {
  isSameOriginPackageRequest,
  packagePrivateResponseHeaders,
} from "@/lib/phaseone/package-route-security";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

function json(body: object, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: packagePrivateResponseHeaders,
  });
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action: rawAction } = await context.params;
  if (!isPackageAction(rawAction)) {
    return json({ error: "Unknown event action." }, 404);
  }

  if (
    !isSameOriginPackageRequest({
      requestUrl: request.url,
      origin: request.headers.get("origin"),
      fetchSite: request.headers.get("sec-fetch-site"),
    })
  ) {
    return json({ error: "Cross-origin event access is not allowed." }, 403);
  }

  const contentType = request.headers.get("content-type")?.toLowerCase() ?? "";
  if (!contentType.startsWith("application/json")) {
    return json({ error: "Event access requires JSON." }, 415);
  }

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return json({ error: "Enter the action PIN." }, 400);
  }

  const supabase = getPhaseOneAdminClient();
  const secret = getPhaseOneServerSecret();
  const clientKey = createClientKey(
    request.headers.get("x-forwarded-for"),
    request.headers.get("user-agent"),
    secret,
  );
  const pinColumns =
    rawAction === "sign-in"
      ? "id, sign_in_pin_salt, sign_in_pin_hash, sign_in_pin_updated_at"
      : "id, sign_out_pin_salt, sign_out_pin_hash, sign_out_pin_updated_at";

  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select(pinColumns)
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load event action PIN", {
      code: error.code,
      slug,
      action: rawAction,
    });
    return json({ error: "Event access is unavailable." }, 500);
  }

  const configuredPin = event
    ? getPackageActionPin(event as unknown as PackageActionPinRecord, rawAction)
    : null;
  if (!event || !configuredPin) {
    return json({ error: "This action is not configured." }, 404);
  }

  const scope = packageActionRateLimitScope(event.id, rawAction, clientKey);
  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("phaseone_pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("event_id", scope.eventId)
    .eq("action_type", scope.actionType)
    .eq("client_key", scope.clientKey)
    .eq("was_successful", false)
    .gte("attempted_at", since);

  if (countError) {
    console.error("Unable to check event PIN rate limit", {
      code: countError.code,
      slug,
      action: rawAction,
    });
    return json({ error: "Event access is unavailable." }, 500);
  }
  if ((count ?? 0) >= 5) {
    return json({ error: "Too many attempts. Try again in 15 minutes." }, 429);
  }

  const wasSuccessful = verifyPin(
    parsed.data.pin,
    configuredPin.salt,
    configuredPin.hash,
  );

  const { error: auditError } = await supabase.from("phaseone_pin_attempts").insert({
    event_id: event.id,
    action_type: packageActionAuditType(rawAction),
    client_key: clientKey,
    was_successful: wasSuccessful,
  });
  if (auditError) {
    console.error("Unable to record event PIN attempt", {
      code: auditError.code,
      slug,
      action: rawAction,
    });
    return json({ error: "Event access is unavailable." }, 500);
  }

  if (!wasSuccessful) {
    return json({ error: "Incorrect PIN." }, 401);
  }

  const response = json({ ok: true });
  response.cookies.set(
    packageActionCookieName(event.id, rawAction),
    createPackageActionAccessToken(
      event.id,
      rawAction,
      configuredPin.updatedAt,
      secret,
    ),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: packageActionAccessMaxAge,
    },
  );
  return response;
}
