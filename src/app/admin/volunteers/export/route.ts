import { NextRequest } from "next/server";
import { redirect } from "next/navigation";

import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const dynamic = "force-dynamic";

function csvCell(value: unknown) {
  const text = value == null ? "" : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

async function requireVolunteerDataAccess() {
  const { supabase, userId } = await requireActiveAccount("/admin/volunteers");
  const rolesResult = await supabase
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);

  if (
    rolesResult.error ||
    !(rolesResult.data ?? []).some(({ role }) => role === "volteam" || role === "admin")
  ) {
    redirect("/dashboard?error=event_access_denied");
  }
}

export async function GET(request: NextRequest) {
  await requireVolunteerDataAccess();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim().toLowerCase();
  const planningArea = searchParams.get("planningArea") ?? "";
  const electoralDivision = searchParams.get("electoralDivision") ?? "";
  const tshirtSize = searchParams.get("tshirtSize") ?? "";
  const qualification = searchParams.get("qualification") ?? "";

  const admin = getPhaseOneAdminClient();
  const [volunteerResult, privateResult] = await Promise.all([
    admin
      .schema("core")
      .from("volunteers")
      .select("id, volunteer_code, display_name, mobile, primary_email_normalized")
      .order("display_name")
      .limit(10000),
    admin
      .from("volunteer_private_details")
      .select(
        "volunteer_id, date_of_birth, postal_code, neighbourhood, planning_area, electoral_division, tshirt_size, highest_qualification",
      )
      .limit(10000),
  ]);

  if (volunteerResult.error || privateResult.error) {
    return new Response("Volunteer export could not be generated.", { status: 500 });
  }

  const detailsById = new Map(
    (privateResult.data ?? []).map((row) => [row.volunteer_id, row]),
  );

  const records = (volunteerResult.data ?? [])
    .map((volunteer) => ({
      volunteer,
      details: detailsById.get(volunteer.id),
    }))
    .filter(({ volunteer, details }) => {
      const haystack = [
        volunteer.volunteer_code,
        volunteer.display_name,
        volunteer.primary_email_normalized,
        volunteer.mobile,
        details?.postal_code,
        details?.neighbourhood,
        details?.planning_area,
        details?.electoral_division,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();

      return (
        (!q || haystack.includes(q)) &&
        (!planningArea || details?.planning_area === planningArea) &&
        (!electoralDivision || details?.electoral_division === electoralDivision) &&
        (!tshirtSize || details?.tshirt_size === tshirtSize) &&
        (!qualification || details?.highest_qualification === qualification)
      );
    });

  const header = [
    "volunteer_id",
    "volunteer_name",
    "email",
    "mobile",
    "date_of_birth",
    "postal_code",
    "neighbourhood",
    "planning_area",
    "electoral_division",
    "tshirt_size",
    "highest_qualification",
  ];

  const rows = records.map(({ volunteer, details }) => [
    volunteer.volunteer_code,
    volunteer.display_name,
    volunteer.primary_email_normalized,
    volunteer.mobile,
    details?.date_of_birth,
    details?.postal_code,
    details?.neighbourhood,
    details?.planning_area,
    details?.electoral_division,
    details?.tshirt_size,
    details?.highest_qualification,
  ]);

  const csv = [header, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n");

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": 'attachment; filename="keluarga-volunteers.csv"',
      "Cache-Control": "no-store",
    },
  });
}
