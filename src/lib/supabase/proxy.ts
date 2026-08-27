import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

import { getPublicConfig } from "@/lib/env";
import type { Database } from "@/types/database";

export async function updateSession(
  request: NextRequest,
  requestHeaders: Headers,
) {
  const { supabaseUrl, supabasePublishableKey } = getPublicConfig();
  let response = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient<Database>(
    supabaseUrl,
    supabasePublishableKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet, responseHeaders) {
          for (const { name, value } of cookiesToSet) {
            request.cookies.set(name, value);
          }

          const refreshedRequestHeaders = new Headers(requestHeaders);
          const refreshedCookieHeader = request.cookies.toString();
          if (refreshedCookieHeader) {
            refreshedRequestHeaders.set("cookie", refreshedCookieHeader);
          } else {
            refreshedRequestHeaders.delete("cookie");
          }

          response = NextResponse.next({
            request: { headers: refreshedRequestHeaders },
          });

          for (const { name, value, options } of cookiesToSet) {
            response.cookies.set(name, value, options);
          }

          for (const [key, value] of Object.entries(responseHeaders)) {
            response.headers.set(key, value);
          }
        },
      },
    },
  );

  const { data } = await supabase.auth.getClaims();
  const isAuthenticated = Boolean(data?.claims?.sub);
  const isProtectedRoute =
    request.nextUrl.pathname.startsWith("/dashboard") ||
    request.nextUrl.pathname.startsWith("/admin");

  if (!isAuthenticated && isProtectedRoute) {
    const loginUrl = request.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.search = "";
    loginUrl.searchParams.set(
      "next",
      `${request.nextUrl.pathname}${request.nextUrl.search}`,
    );
    return NextResponse.redirect(loginUrl);
  }

  if (isAuthenticated && request.nextUrl.pathname === "/login") {
    const dashboardUrl = request.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.search = "";
    return NextResponse.redirect(dashboardUrl);
  }

  return response;
}
