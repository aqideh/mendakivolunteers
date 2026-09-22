import type { Metadata } from "next";
import Link from "next/link";

import { PortalHeader } from "@/components/portal-header";
import { requireGamificationManager } from "@/lib/auth/gamification-access";
import { formatPoints } from "@/lib/gamification/read-model";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { awardManualPoints } from "./actions";

export const metadata: Metadata = { title: "Points management" };
export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function safeSearch(value: string): string {
  return value.replace(/[%_]/g, "").trim().slice(0, 120);
}

export default async function PointsAdminPage({ searchParams }: PageProps) {
  await requireGamificationManager("/admin/points");
  const parameters = await searchParams;
  const q = safeSearch(parameter(parameters, "q") ?? "");
  const error = parameter(parameters, "error");
  const success = parameter(parameters, "success");
  const admin = getPhaseOneAdminClient();

  let volunteerQuery = admin
    .schema("core")
    .from("volunteers")
    .select(
      "id, volunteer_code, display_name, primary_email_normalized, mobile, updated_at",
    )
    .order("display_name", { ascending: true, nullsFirst: false })
    .limit(100);

  if (q) {
    if (/^KEL\d{5}$/i.test(q)) {
      volunteerQuery = volunteerQuery.eq("volunteer_code", q.toUpperCase());
    } else if (q.includes("@")) {
      volunteerQuery = volunteerQuery.ilike(
        "primary_email_normalized",
        `%${q.toLowerCase()}%`,
      );
    } else {
      volunteerQuery = volunteerQuery.ilike("display_name", `%${q}%`);
    }
  }

  const volunteerResult = await volunteerQuery;
  if (volunteerResult.error || !volunteerResult.data) {
    throw new Error("Volunteer point-management list could not be loaded");
  }

  const volunteers = volunteerResult.data;
  const volunteerIds = volunteers.map(({ id }) => id);
  const balancesResult = volunteerIds.length
    ? await admin
        .schema("gamification")
        .from("volunteer_point_balances")
        .select("volunteer_id, points_balance, last_changed_at")
        .in("volunteer_id", volunteerIds)
    : { data: [], error: null };

  if (balancesResult.error) {
    throw new Error("Volunteer point balances could not be loaded");
  }

  const balanceByVolunteer = new Map(
    (balancesResult.data ?? []).map((row) => [
      row.volunteer_id,
      Number(row.points_balance),
    ]),
  );

  return (
    <div className="site-shell">
      <PortalHeader status="Points management" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">KELUARGA recognition</p>
            <h1>Points management</h1>
            <p className="muted">
              Award explicit staff-recognition points. These entries are separate
              from points derived from verified YM Hub attendance and are retained
              in the append-only point ledger.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/dashboard">
              Back to My Profile
            </Link>
          </div>
        </div>

        {success === "points_awarded" ? (
          <div className="notice notice-success" role="status">
            Recognition points awarded.
          </div>
        ) : null}
        {error ? (
          <div className="notice notice-error" role="alert">
            {error === "invalid_award"
              ? "Enter a valid point amount and a reason of at least five characters."
              : "The point award could not be recorded. No points were added."}
          </div>
        ) : null}

        <section className="section" aria-labelledby="points-search-title">
          <p className="eyebrow">Find volunteer</p>
          <h2 id="points-search-title">Search profiles</h2>
          <form method="get" className="phaseone-admin-form">
            <div className="form-field">
              <label htmlFor="points-volunteer-search">
                Name, KELUARGA volunteer ID, or email
              </label>
              <input
                id="points-volunteer-search"
                maxLength={120}
                name="q"
                defaultValue={q}
              />
            </div>
            <div className="actions">
              <button className="button button-primary" type="submit">
                Search
              </button>
              {q ? (
                <Link className="button button-secondary" href="/admin/points">
                  Clear
                </Link>
              ) : null}
            </div>
          </form>
        </section>

        <section className="record-list" aria-label="Volunteer point awards">
          {volunteers.map((volunteer) => {
            const balance = balanceByVolunteer.get(volunteer.id) ?? 0;
            return (
              <article className="panel" key={volunteer.id}>
                <div className="section-header">
                  <div>
                    <p className="eyebrow">{volunteer.volunteer_code}</p>
                    <h2>{volunteer.display_name ?? "Volunteer"}</h2>
                    <p className="muted">
                      {volunteer.primary_email_normalized ?? "No email"}
                      {volunteer.mobile ? ` · ${volunteer.mobile}` : ""}
                    </p>
                  </div>
                  <span className="status-pill">
                    {formatPoints(balance)} points
                  </span>
                </div>

                <form action={awardManualPoints} className="phaseone-admin-form">
                  <input
                    name="volunteerId"
                    type="hidden"
                    value={volunteer.id}
                  />
                  <div className="form-field">
                    <label htmlFor={`points-${volunteer.id}`}>Points</label>
                    <input
                      id={`points-${volunteer.id}`}
                      inputMode="decimal"
                      max="10000"
                      min="0.01"
                      name="points"
                      required
                      step="0.01"
                      type="number"
                    />
                  </div>
                  <div className="form-field">
                    <label htmlFor={`reason-${volunteer.id}`}>
                      Recognition reason
                    </label>
                    <input
                      id={`reason-${volunteer.id}`}
                      maxLength={500}
                      minLength={5}
                      name="reason"
                      required
                    />
                  </div>
                  <div className="actions">
                    <button className="button button-primary" type="submit">
                      Award points
                    </button>
                  </div>
                </form>
              </article>
            );
          })}
          {volunteers.length === 0 ? (
            <div className="panel empty-state">
              No volunteer profiles match this search.
            </div>
          ) : null}
        </section>
      </main>
    </div>
  );
}
