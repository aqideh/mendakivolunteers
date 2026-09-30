import { NextResponse } from "next/server";

import { hasGamificationManagerRole } from "@/lib/auth/gamification-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";
import type { AppRole } from "@/types/database";

export const dynamic = "force-dynamic";

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

export async function GET(request: Request) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    return NextResponse.redirect(
      new URL(`/login?next=${encodeURIComponent("/admin/rewards")}`, request.url),
    );
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

  const roles = (rolesResult.data ?? []).map(({ role }) => role as AppRole);
  if (
    accountResult.error ||
    rolesResult.error ||
    accountResult.data?.status !== "active" ||
    !hasGamificationManagerRole(roles)
  ) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  const url = new URL(request.url);
  const partnerId = url.searchParams.get("partner");
  const admin = getPhaseOneAdminClient();

  let query = admin
    .schema("gamification")
    .from("reward_redemptions")
    .select(
      "id, partner_id, volunteer_code_snapshot, volunteer_name_snapshot, volunteer_email_snapshot, reward_name_snapshot, partner_name_snapshot, points_cost, status, redeemed_at, issued_at, cancelled_at, refunded_at",
    )
    .order("redeemed_at", { ascending: false });

  if (partnerId && /^[0-9a-f-]{36}$/i.test(partnerId)) {
    query = query.eq("partner_id", partnerId);
  }

  const { data: redemptions, error } = await query;
  if (error) {
    console.error("Unable to export reward redemptions", { code: error.code });
    return new NextResponse("Export unavailable", { status: 500 });
  }

  const rows = redemptions ?? [];
  const redemptionIds = rows.map((row) => row.id);
  const vouchersResult = redemptionIds.length
    ? await admin
        .schema("gamification")
        .from("reward_vouchers")
        .select("redemption_id, voucher_code, sponsor_reference, expires_at")
        .in("redemption_id", redemptionIds)
    : { data: [], error: null };

  if (vouchersResult.error) {
    return new NextResponse("Export unavailable", { status: 500 });
  }

  const voucherByRedemption = new Map(
    (vouchersResult.data ?? []).map((voucher) => [
      voucher.redemption_id,
      voucher,
    ]),
  );

  const header = [
    "Redemption ID",
    "Redeemed at",
    "Status",
    "Partner",
    "Reward",
    "Volunteer ID",
    "Volunteer name",
    "Volunteer email",
    "Points",
    "Voucher code",
    "Sponsor reference",
    "Voucher expiry",
    "Issued at",
    "Cancelled at",
    "Refunded at",
  ];

  const lines = [
    header.map(csvCell).join(","),
    ...rows.map((row) => {
      const voucher = voucherByRedemption.get(row.id);
      return [
        row.id,
        row.redeemed_at,
        row.status,
        row.partner_name_snapshot,
        row.reward_name_snapshot,
        row.volunteer_code_snapshot,
        row.volunteer_name_snapshot,
        row.volunteer_email_snapshot,
        row.points_cost,
        voucher?.voucher_code,
        voucher?.sponsor_reference,
        voucher?.expires_at,
        row.issued_at,
        row.cancelled_at,
        row.refunded_at,
      ]
        .map(csvCell)
        .join(",");
    }),
  ];

  const partnerForAudit =
    partnerId && /^[0-9a-f-]{36}$/i.test(partnerId) ? partnerId : null;

  const auditResult = await admin
    .schema("gamification")
    .from("reward_partner_report_exports")
    .insert({
      partner_id: partnerForAudit,
      generated_by: userId,
      row_count: rows.length,
      parameters: {
        partner_id: partnerForAudit,
        format: "csv",
      },
    });

  if (auditResult.error) {
    console.error("Unable to record reward export audit", {
      code: auditResult.error.code,
      userId,
    });
    return new NextResponse("Export unavailable", { status: 500 });
  }

  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  return new NextResponse(lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="keluarga-reward-redemptions-${date}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
