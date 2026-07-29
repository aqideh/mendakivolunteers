import type { EmailOtpType } from "@supabase/supabase-js";
import { NextResponse, type NextRequest } from "next/server";

import { getSafeRedirectPath } from "@/lib/security/redirects";
import { createClient } from "@/lib/supabase/server";

const allowedOtpTypes = new Set<EmailOtpType>(["email", "magiclink"]);

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get("code");
  const tokenHash = request.nextUrl.searchParams.get("token_hash");
  const rawType = request.nextUrl.searchParams.get("type");
  const nextPath = getSafeRedirectPath(
    request.nextUrl.searchParams.get("next"),
    "/dashboard",
  );
  const supabase = await createClient();

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    console.error("Magic-link code exchange failed", {
      code: error.code,
      status: error.status,
    });
  }

  if (
    tokenHash &&
    rawType &&
    allowedOtpTypes.has(rawType as EmailOtpType)
  ) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: rawType as EmailOtpType,
    });

    if (!error) {
      return NextResponse.redirect(new URL(nextPath, request.url));
    }

    console.error("Magic-link token verification failed", {
      code: error.code,
      status: error.status,
    });
  }

  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("error", "invalid_or_expired_link");
  return NextResponse.redirect(loginUrl);
}
