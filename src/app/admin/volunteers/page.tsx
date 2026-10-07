import type { Metadata } from "next";
import { redirect } from "next/navigation";

import {
  VolunteerDirectoryTable,
  type VolunteerDirectoryRow,
} from "@/components/admin/volunteer-directory-table";
import { requireActiveAccount } from "@/lib/auth/account-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = {
  title: "Volunteer directory",
};

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
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
  const today = {
    year: Number(todayParts.find(({ type }) => type === "year")?.value),
    month: Number(todayParts.find(({ type }) => type === "month")?.value),
    day: Number(todayParts.find(({ type }) => type === "day")?.value),
  };

  let age = today.year - year;
  if (today.month < month || (today.month === month && today.day < day)) age -= 1;
  return age >= 0 && age <= 120 ? age : null;
}

export default async function VolunteerDirectoryPage({ searchParams }: PageProps) {
  await requireVolunteerDataAccess();
  const parameters = await searchParams;

  const admin = getPhaseOneAdminClient();
  const [volunteerResult, privateResult] = await Promise.all([
    admin
      .schema("core")
      .from("volunteers")
      .select("id, volunteer_code, display_name, mobile, primary_email_normalized")
      .order("display_name")
      .limit(5000),
    admin
      .from("volunteer_private_details")
      .select(
        "volunteer_id, postal_code, neighbourhood, planning_area, electoral_division, tshirt_size, highest_qualification, date_of_birth",
      )
      .limit(5000),
  ]);

  if (volunteerResult.error || privateResult.error) {
    throw new Error("Volunteer directory could not be loaded");
  }

  const detailsById = new Map(
    (privateResult.data ?? []).map((row) => [row.volunteer_id, row]),
  );

  const rows: VolunteerDirectoryRow[] = (volunteerResult.data ?? []).map((volunteer) => {
    const details = detailsById.get(volunteer.id);
    return {
      id: volunteer.id,
      volunteerCode: volunteer.volunteer_code,
      displayName: volunteer.display_name ?? "Volunteer",
      email: volunteer.primary_email_normalized,
      mobile: volunteer.mobile,
      postalCode: details?.postal_code ?? null,
      neighbourhood: details?.neighbourhood ?? null,
      planningArea: details?.planning_area ?? null,
      electoralDivision: details?.electoral_division ?? null,
      tshirtSize: details?.tshirt_size ?? null,
      highestQualification: details?.highest_qualification ?? null,
      age: ageFromDateOfBirth(details?.date_of_birth ?? null),
    };
  });

  const planningAreas = Array.from(
    new Set(rows.map((row) => row.planningArea).filter((value): value is string => Boolean(value))),
  ).sort();
  const electoralDivisions = Array.from(
    new Set(rows.map((row) => row.electoralDivision).filter((value): value is string => Boolean(value))),
  ).sort();
  const qualifications = Array.from(
    new Set(rows.map((row) => row.highestQualification).filter((value): value is string => Boolean(value))),
  ).sort();

  return (
    <div className="admin-page site-shell">
      <div className="admin-page-frame page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Volunteer directory</h1>
            <p className="muted">
              Find volunteers by name, location and profile information.
            </p>
          </div>
        </div>

        <VolunteerDirectoryTable
          initialRows={rows}
          planningAreas={planningAreas}
          electoralDivisions={electoralDivisions}
          qualifications={qualifications}
          initialFilters={{
            query: parameter(parameters, "q") ?? "",
            planningArea: parameter(parameters, "planningArea") ?? "",
            electoralDivision: parameter(parameters, "electoralDivision") ?? "",
            tshirtSize: parameter(parameters, "tshirtSize") ?? "",
            qualification: parameter(parameters, "qualification") ?? "",
            minAge: parameter(parameters, "minAge") ?? "",
            maxAge: parameter(parameters, "maxAge") ?? "",
          }}
        />
      </div>
    </div>
  );
}
