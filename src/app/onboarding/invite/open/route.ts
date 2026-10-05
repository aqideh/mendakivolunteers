import { NextRequest, NextResponse } from "next/server";

import {
  createSecureToken,
  hashSecureToken,
  volunteerOnboardingContextCookie,
  volunteerOnboardingContextMaxAgeSeconds,
} from "@/lib/auth/volunteer-onboarding-invite";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const dynamic = "force-dynamic";

function redirectWithState(request: NextRequest, state: string) {
  const destination = new URL("/onboarding/invite", request.url);
  destination.searchParams.set("state", state);
  destination.hash = "invitation";

  const response = NextResponse.redirect(destination, 303);
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}

export async function GET(request: NextRequest) {
  const rawToken = request.nextUrl.searchParams.get("t")?.trim();

  if (!rawToken || rawToken.length > 256) {
    return redirectWithState(request, "invalid");
  }

  const admin = getPhaseOneAdminClient();
  const tokenHash = hashSecureToken(rawToken);

  const inviteResult = await admin
    .schema("core")
    .from("volunteer_onboarding_invites")
    .select("id,status,expires_at,revoked_at")
    .eq("token_hash", tokenHash)
    .maybeSingle();

  if (inviteResult.error || !inviteResult.data) {
    return redirectWithState(request, "invalid");
  }

  const invite = inviteResult.data;
  if (invite.status === "accepted") {
    return redirectWithState(request, "used");
  }
  if (invite.status === "revoked" || invite.revoked_at) {
    return redirectWithState(request, "revoked");
  }
  if (invite.status === "redeeming") {
    return redirectWithState(request, "busy");
  }
  if (
    !["pending", "sent"].includes(invite.status) ||
    !invite.expires_at ||
    new Date(invite.expires_at).getTime() <= Date.now()
  ) {
    return redirectWithState(request, "expired");
  }

  const contextSecret = createSecureToken();
  const contextHash = hashSecureToken(contextSecret);
  const expiresAt = new Date(
    Date.now() + volunteerOnboardingContextMaxAgeSeconds * 1000,
  ).toISOString();

  const contextResult = await admin
    .schema("core")
    .from("volunteer_onboarding_redemption_contexts")
    .insert({
      invite_id: invite.id,
      context_hash: contextHash,
      expires_at: expiresAt,
    });

  if (contextResult.error) {
    console.error("Unable to create onboarding redemption context", {
      code: contextResult.error.code,
    });
    return redirectWithState(request, "unavailable");
  }

  const destination = new URL("/onboarding/invite", request.url);
  destination.hash = "invitation";
  const response = NextResponse.redirect(destination, 303);
  response.cookies.set(volunteerOnboardingContextCookie, contextSecret, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/onboarding",
    maxAge: volunteerOnboardingContextMaxAgeSeconds,
  });
  response.headers.set("Cache-Control", "private, no-store");
  response.headers.set("Referrer-Policy", "no-referrer");
  return response;
}
