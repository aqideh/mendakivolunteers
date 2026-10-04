import { NextResponse, type NextRequest } from "next/server";

import { getAppEnvironment, getPublicConfig } from "@/lib/env";
import { buildContentSecurityPolicy } from "@/lib/security/headers";
import { buildCanonicalStagingRedirectUrl } from "@/lib/staging-canonical-url";
import { updateSession } from "@/lib/supabase/proxy";

export async function proxy(request: NextRequest) {
  const appEnvironment = getAppEnvironment();
  const { appUrl, supabaseUrl } = getPublicConfig();
  const nonce = crypto.randomUUID().replaceAll("-", "");
  const contentSecurityPolicy = buildContentSecurityPolicy({
    appEnvironment,
    nonce,
    supabaseUrl,
  });
  const isStagingBranch =
    appEnvironment === "staging" &&
    process.env.VERCEL_ENV === "preview" &&
    process.env.VERCEL_GIT_COMMIT_REF === "staging";

  const shouldUseCanonicalHost =
    appEnvironment === "production" || isStagingBranch;

  if (shouldUseCanonicalHost) {
    const redirectUrl = buildCanonicalStagingRedirectUrl(
      request.nextUrl.toString(),
      appUrl,
    );
    if (redirectUrl) {
      return Response.redirect(redirectUrl, 307);
    }
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("Content-Security-Policy", contentSecurityPolicy);
  requestHeaders.set("x-nonce", nonce);

  // Auth callback credentials arrive in the browser while an older KELUARGA
  // session cookie may still be present. Refreshing that older cookie here can
  // rotate it at the same time the callback is installing the fresh recovery
  // session. Keep the callback request session-neutral and let /auth/confirm
  // own the auth handoff end-to-end.
  const response =
    request.nextUrl.pathname === "/auth/confirm"
      ? NextResponse.next({ request: { headers: requestHeaders } })
      : await updateSession(request, requestHeaders);

  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  if (request.nextUrl.pathname === "/auth/confirm") {
    response.headers.set("Cache-Control", "private, no-store");
  }

  if (appEnvironment === "production") {
    response.headers.set(
      "Strict-Transport-Security",
      "max-age=63072000; includeSubDomains; preload",
    );
  }

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
