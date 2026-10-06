import Fuse from "fuse.js";
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

function ageFromDateOfBirth(value: string | null): number | null {
  if (!value) return null;
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return null;

  const todayParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const currentYear = Number(todayParts.find(({ type }) => type === "year")?.value);
  const currentMonth = Number(todayParts.find(({ type }) => type === "month")?.value);
  const currentDay = Number(todayParts.find(({ type }) => type === "day")?.value);

  let age = currentYear - year;
  if (currentMonth < month || (currentMonth === month && currentDay < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

function numberParam(value: string | null): number | null {
  if (!value?.trim()) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export async function GET(request: NextRequest) {
  await requireVolunteerDataAccess();
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get("q") ?? "").trim();
  const planningArea = searchParams.get("planningArea") ?? "";
  const electoralDivision = searchParams.get("electoralDivision") ?? "";
  const tshirtSize = searchParams.get("tshirtSize") ?? "";
  const qualification = searchParams.get("qualification") ?? "";
  const minAge = numberParam(searchParams.get("minAge"));
  const maxAge = numberParam(searchParams.get("maxAge"));

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

  const records = (volunteerResult.data ?? []).map((volunteer) => {
    const details = detailsById.get(volunteer.id);
    return {
      volunteer,
      details,
      age: ageFromDateOfBirth(details?.date_of_birth ?? null),
    };
  });

  const fuse = new Fuse(records, {
    threshold: 0.32,
    ignoreLocation: true,
    keys: [
      { name: "volunteer.display_name", weight: 1 },
      { name: "volunteer.volunteer_code", weight: 0.9 },
      { name: "volunteer.primary_email_normalized", weight: 0.8 },
      { name: "volunteer.mobile", weight: 0.8 },
      { name: "details.postal_code", weight: 0.5 },
      { name: "details.neighbourhood", weight: 0.5 },
      { name: "details.planning_area", weight: 0.5 },
      { name: "details.electoral_division", weight: 0.4 },
    ],
  });

  const searched = q ? fuse.search(q).map(({ item }) => item) : records;
  const filtered = searched.filter(({ details, age }) => {
    if (planningArea && details?.planning_area !== planningArea) return false;
    if (electoralDivision && details?.electoral_division !== electoralDivision) return false;
    if (tshirtSize && details?.tshirt_size !== tshirtSize) return false;
    if (qualification && details?.highest_qualification !== qualification) return false;
    if (minAge !== null && (age === null || age < minAge)) return false;
    if (maxAge !== null && (age === null || age > maxAge)) return false;
    return true;
  });

  const header = [
    "volunteer_id",
    "volunteer_name",
    "email",
    "mobile",
    "date_of_birth",
    "age",
    "postal_code",
    "neighbourhood",
    "planning_area",
    "electoral_division",
    "tshirt_size",
    "highest_qualification",
  ];

  const rows = filtered.map(({ volunteer, details, age }) => [
    volunteer.volunteer_code,
    volunteer.display_name,
    volunteer.primary_email_normalized,
    volunteer.mobile,
    details?.date_of_birth,
    age,
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
