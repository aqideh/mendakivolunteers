"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

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

function shouldTrack(pathname: string) {
  return !EXCLUDED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

export function WebsiteAnalyticsTracker() {
  const pathname = usePathname();
  const lastTracked = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname || !shouldTrack(pathname)) return;

    const search = window.location.search;
    const pageKey = `${pathname}${search}`;
    if (lastTracked.current === pageKey) return;
    lastTracked.current = pageKey;

    const params = new URLSearchParams(search);
    const payload = JSON.stringify({
      path: pathname,
      referrer: document.referrer || null,
      utmSource: params.get("utm_source"),
    });

    void fetch("/api/analytics/pageview", {
      method: "POST",
      body: payload,
      headers: { "content-type": "application/json" },
      keepalive: true,
      credentials: "same-origin",
    }).catch(() => {
      // Analytics must never block or degrade the volunteer experience.
    });
  }, [pathname]);

  return null;
}
