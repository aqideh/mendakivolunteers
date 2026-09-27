import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
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

export default async function VolunteerDirectoryPage({ searchParams }: PageProps) {
  await requireVolunteerDataAccess();
  const parameters = await searchParams;
  const q = (parameter(parameters, "q") ?? "").trim().toLowerCase();
  const planningArea = parameter(parameters, "planningArea") ?? "";
  const electoralDivision = parameter(parameters, "electoralDivision") ?? "";
  const tshirtSize = parameter(parameters, "tshirtSize") ?? "";
  const qualification = parameter(parameters, "qualification") ?? "";

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

  const planningAreas = Array.from(
    new Set((privateResult.data ?? []).map((row) => row.planning_area).filter(Boolean)),
  ).sort();
  const electoralDivisions = Array.from(
    new Set((privateResult.data ?? []).map((row) => row.electoral_division).filter(Boolean)),
  ).sort();
  const qualifications = Array.from(
    new Set((privateResult.data ?? []).map((row) => row.highest_qualification).filter(Boolean)),
  ).sort();

  const exportQuery = new URLSearchParams();
  if (q) exportQuery.set("q", q);
  if (planningArea) exportQuery.set("planningArea", planningArea);
  if (electoralDivision) exportQuery.set("electoralDivision", electoralDivision);
  if (tshirtSize) exportQuery.set("tshirtSize", tshirtSize);
  if (qualification) exportQuery.set("qualification", qualification);

  return (
    <div className="site-shell">
      <PortalHeader status="Volunteer directory" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Volunteer directory</h1>
            <p className="muted">
              Find volunteers by location and profile information.
            </p>
          </div>
          <a
            className="button button-secondary"
            href={`/admin/volunteers/export?${exportQuery.toString()}`}
          >
            Export filtered CSV
          </a>
        </div>

        <form className="phaseone-admin-form" method="get">
          <div className="form-grid">
            <div className="form-field">
              <label htmlFor="volunteer-search">Search</label>
              <input
                id="volunteer-search"
                name="q"
                defaultValue={q}
                placeholder="Name, volunteer ID, email, postal code"
              />
            </div>
            <div className="form-field">
              <label htmlFor="volunteer-planning-area">Planning area</label>
              <select id="volunteer-planning-area" name="planningArea" defaultValue={planningArea}>
                <option value="">All</option>
                {planningAreas.map((value) => (
                  <option key={value} value={value!}>{value}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="volunteer-electoral-division">GRC / SMC</label>
              <select
                id="volunteer-electoral-division"
                name="electoralDivision"
                defaultValue={electoralDivision}
              >
                <option value="">All</option>
                {electoralDivisions.map((value) => (
                  <option key={value} value={value!}>{value}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="volunteer-shirt-size">T-shirt size</label>
              <select id="volunteer-shirt-size" name="tshirtSize" defaultValue={tshirtSize}>
                <option value="">All</option>
                {["S","M","L","XL","2XL","3XL","5XL","7XL"].map((value) => (
                  <option key={value} value={value}>{value}</option>
                ))}
              </select>
            </div>
            <div className="form-field">
              <label htmlFor="volunteer-qualification">Highest qualification</label>
              <select
                id="volunteer-qualification"
                name="qualification"
                defaultValue={qualification}
              >
                <option value="">All</option>
                {qualifications.map((value) => (
                  <option key={value} value={value!}>{String(value).replaceAll("_", " ")}</option>
                ))}
              </select>
            </div>
          </div>
          <div className="actions">
            <button className="button button-primary" type="submit">Apply filters</button>
            <Link className="button button-secondary" href="/admin/volunteers">Clear</Link>
          </div>
        </form>

        <section className="section" aria-labelledby="volunteer-results-title">
          <div className="section-header">
            <div>
              <h2 id="volunteer-results-title">Volunteers</h2>
              <p className="muted">{records.length} matching records</p>
            </div>
          </div>
          <div className="table-wrap">
            <table className="content-table">
              <thead>
                <tr>
                  <th>Volunteer</th>
                  <th>Postal code</th>
                  <th>Neighbourhood / planning area</th>
                  <th>GRC / SMC</th>
                  <th>Shirt</th>
                  <th>Qualification</th>
                </tr>
              </thead>
              <tbody>
                {records.map(({ volunteer, details }) => (
                  <tr key={volunteer.id}>
                    <td>
                      <strong>{volunteer.display_name ?? "Volunteer"}</strong>
                      <br />
                      <span className="muted">{volunteer.volunteer_code}</span>
                    </td>
                    <td>{details?.postal_code ?? "—"}</td>
                    <td>
                      {details?.neighbourhood ?? details?.planning_area ?? "Pending location verification"}
                    </td>
                    <td>{details?.electoral_division ?? "Pending verification"}</td>
                    <td>{details?.tshirt_size ?? "—"}</td>
                    <td>{details?.highest_qualification?.replaceAll("_", " ") ?? "—"}</td>
                  </tr>
                ))}
                {records.length === 0 ? (
                  <tr><td colSpan={6}>No volunteers match these filters.</td></tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
