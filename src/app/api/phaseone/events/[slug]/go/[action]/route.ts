import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import {
  eventAccessCookieName,
  readEventAccessToken,
} from "@/lib/phaseone/event-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.enum(["sign-in", "sign-out"]);

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action: rawAction } = await context.params;
  const action = actionSchema.safeParse(rawAction);
  if (!action.success) {
    return NextResponse.json({ error: "Unknown event action." }, { status: 404 });
  }

  const supabase = getPhaseOneAdminClient();
  const { data: event, error } = await supabase
    .from("phaseone_events")
    .select("id, pin_updated_at, sign_in_url, sign_out_url")
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error || !event || !event.pin_updated_at) {
    return NextResponse.json({ error: "Event access is unavailable." }, { status: 404 });
  }

  const token = request.cookies.get(eventAccessCookieName(event.id))?.value;
  const claims = readEventAccessToken(token, getPhaseOneServerSecret());
  if (
    !claims ||
    claims.eventId !== event.id ||
    claims.pinUpdatedAt !== event.pin_updated_at
  ) {
    return NextResponse.redirect(new URL(`/events/${slug}?access=expired`, request.url));
  }

  const destination =
    action.data === "sign-in" ? event.sign_in_url : event.sign_out_url;
  if (!destination) {
    return NextResponse.redirect(new URL(`/events/${slug}?access=unavailable`, request.url));
  }

  return NextResponse.redirect(destination);
}
