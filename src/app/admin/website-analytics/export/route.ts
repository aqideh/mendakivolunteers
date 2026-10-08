import { NextRequest, NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { csvCell } from "@/lib/security/csv";

export const runtime = "nodejs";

type DailyPoint = {
  day: string;
  pageviews: number;
  visitors: number;
  signups: number;
  registrations: number;
  registrants: number;
  cumulative_pageviews: number;
  cumulative_visitors: number;
  cumulative_signups: number;
  cumulative_registrations: number;
  cumulative_registrants: number;
};

type AnalyticsSummary = {
  daily: DailyPoint[];
};

function validDate(value: string | null) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: claimsData } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [accountResult, rolesResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  const roles = (rolesResult.data ?? []).map(({ role }) => String(role));
  if (
    accountResult.data?.status !== "active" ||
    (!roles.includes("admin") && !roles.includes("volteam"))
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const start = request.nextUrl.searchParams.get("start");
  const end = request.nextUrl.searchParams.get("end");

  if (!validDate(start) || !validDate(end)) {
    return NextResponse.json({ error: "Invalid date range" }, { status: 400 });
  }

  const admin = getPhaseOneAdminClient();
  const { data, error } = await admin.schema("core").rpc("website_analytics_summary", {
    p_start: start,
    p_end: end,
  });

  if (error) {
    console.error("Website analytics export failed", error.code);
    return NextResponse.json({ error: "Export failed" }, { status: 500 });
  }

  const summary = data as AnalyticsSummary;
  const rows = [
    [
      "Date",
      "Daily unique visitors",
      "Cumulative unique visitors",
      "Daily pageviews",
      "Cumulative pageviews",
      "Daily completed sign-ups",
      "Cumulative completed sign-ups",
      "Daily opportunity registrations",
      "Cumulative opportunity registrations",
      "Daily unique registrants",
      "Cumulative unique registrants",
    ],
    ...summary.daily.map((point) => [
      point.day,
      point.visitors,
      point.cumulative_visitors,
      point.pageviews,
      point.cumulative_pageviews,
      point.signups,
      point.cumulative_signups,
      point.registrations,
      point.cumulative_registrations,
      point.registrants,
      point.cumulative_registrants,
    ]),
  ];

  const csv = rows
    .map((row) => row.map((value) => csvCell(String(value))).join(","))
    .join("\r\n");

  return new NextResponse(csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="keluarga-website-analytics-${start}-to-${end}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
