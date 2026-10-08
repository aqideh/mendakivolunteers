import { randomUUID } from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const runtime = "nodejs";

const VISITOR_COOKIE = "keluarga_visitor_id";
const EXCLUDED_PREFIXES = [
  "/admin",
  "/api",
  "/auth",
  "/checkin",
  "/checkout",
  "/dashboard",
  "/login",
  "/profile",
  "/reset-password",
  "/staff",
];

function trackablePath(path: string) {
  return (
    path.startsWith("/") &&
    path.length <= 300 &&
    !EXCLUDED_PREFIXES.some(
      (prefix) => path === prefix || path.startsWith(`${prefix}/`),
    )
  );
}

function sourceLabel(referrer: string | null, utmSource: string | null) {
  const campaign = utmSource?.trim().toLowerCase();
  if (campaign) return campaign.slice(0, 80);

  if (!referrer) return "direct";

  try {
    const hostname = new URL(referrer).hostname.toLowerCase();
    if (!hostname) return "direct";
    if (hostname.includes("google.")) return "google";
    if (hostname.includes("instagram.")) return "instagram";
    if (hostname.includes("facebook.") || hostname === "fb.com") return "facebook";
    if (hostname.includes("linkedin.")) return "linkedin";
    if (hostname.includes("mendaki.org.sg")) return "mendaki.org.sg";
    return hostname.slice(0, 80);
  } catch {
    return "direct";
  }
}

function deviceLabel(userAgent: string) {
  const ua = userAgent.toLowerCase();
  if (/ipad|tablet|kindle|silk/.test(ua)) return "tablet";
  if (/mobi|iphone|android/.test(ua)) return "mobile";
  if (ua) return "desktop";
  return "other";
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const candidate = body as {
    path?: unknown;
    referrer?: unknown;
    utmSource?: unknown;
  };

  const path = typeof candidate.path === "string" ? candidate.path : "";
  if (!trackablePath(path)) {
    return NextResponse.json({ ok: true, tracked: false });
  }

  const referrer =
    typeof candidate.referrer === "string" ? candidate.referrer : null;
  const utmSource =
    typeof candidate.utmSource === "string" ? candidate.utmSource : null;

  const cookieStore = await cookies();
  const existingVisitorId = cookieStore.get(VISITOR_COOKIE)?.value;
  const visitorId =
    existingVisitorId && /^[0-9a-f-]{36}$/i.test(existingVisitorId)
      ? existingVisitorId
      : randomUUID();

  const admin = getPhaseOneAdminClient();
  const { error } = await admin.schema("core").from("website_pageviews").insert({
    visitor_id: visitorId,
    path,
    source: sourceLabel(referrer, utmSource),
    device: deviceLabel(request.headers.get("user-agent") ?? ""),
  });

  if (error) {
    console.error("Website analytics pageview insert failed", error.code);
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  const response = NextResponse.json({ ok: true, tracked: true });
  if (!existingVisitorId) {
    response.cookies.set(VISITOR_COOKIE, visitorId, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }

  return response;
}
