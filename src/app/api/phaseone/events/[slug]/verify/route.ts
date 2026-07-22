import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import {
  createClientKey,
  createEventAccessToken,
  eventAccessCookieName,
  eventAccessMaxAge,
  verifyPin,
} from "@/lib/phaseone/event-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const requestSchema = z.object({
  pin: z.string().trim().regex(/^\d{4,8}$/),
});

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ slug: string }> },
) {
  const { slug } = await context.params;
  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "Enter the event PIN." }, { status: 400 });
  }

  const supabase = getPhaseOneAdminClient();
  const secret = getPhaseOneServerSecret();
  const clientKey = createClientKey(
    request.headers.get("x-forwarded-for"),
    request.headers.get("user-agent"),
    secret,
  );

  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select("id, pin_salt, pin_hash, pin_updated_at")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load event for PIN verification", { code: error.code, slug });
    return NextResponse.json({ error: "Event access is unavailable." }, { status: 500 });
  }
  if (!event || !event.pin_salt || !event.pin_hash || !event.pin_updated_at) {
    return NextResponse.json({ error: "Event access is not configured." }, { status: 404 });
  }

  const since = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabase
    .from("phaseone_pin_attempts")
    .select("id", { count: "exact", head: true })
    .eq("event_id", event.id)
    .eq("client_key", clientKey)
    .eq("was_successful", false)
    .gte("attempted_at", since);

  if (countError) {
    console.error("Unable to check event PIN rate limit", { code: countError.code, slug });
    return NextResponse.json({ error: "Event access is unavailable." }, { status: 500 });
  }
  if ((count ?? 0) >= 5) {
    return NextResponse.json(
      { error: "Too many attempts. Try again in 15 minutes." },
      { status: 429 },
    );
  }

  const wasSuccessful = verifyPin(
    parsed.data.pin,
    event.pin_salt,
    event.pin_hash,
  );

  const { error: auditError } = await supabase.from("phaseone_pin_attempts").insert({
    event_id: event.id,
    client_key: clientKey,
    was_successful: wasSuccessful,
  });
  if (auditError) {
    console.error("Unable to record event PIN attempt", { code: auditError.code, slug });
    return NextResponse.json({ error: "Event access is unavailable." }, { status: 500 });
  }

  if (!wasSuccessful) {
    return NextResponse.json({ error: "Incorrect PIN." }, { status: 401 });
  }

  const response = NextResponse.json({ ok: true });
  response.cookies.set(
    eventAccessCookieName(event.id),
    createEventAccessToken(event.id, event.pin_updated_at, secret),
    {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: eventAccessMaxAge,
    },
  );
  return response;
}
