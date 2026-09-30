import type { Metadata } from "next";
import Link from "next/link";

import { requireGamificationManager } from "@/lib/auth/gamification-access";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { formatPoints } from "@/lib/gamification/read-model";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export const metadata: Metadata = { title: "Rewards & redemptions" };
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

function safeUuid(value: string | undefined): string | null {
  return value && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export default async function RewardsAdminPage({ searchParams }: PageProps) {
  await requireGamificationManager("/admin/rewards");
  const params = await searchParams;
  const selectedPartnerId = safeUuid(parameter(params, "partner"));
  const admin = getPhaseOneAdminClient();

  const partnersResult = await admin
    .schema("gamification")
    .from("reward_partners")
    .select("id, name, status")
    .order("name");

  if (partnersResult.error) {
    throw new Error("Reward partners could not be loaded");
  }

  let redemptionsQuery = admin
    .schema("gamification")
    .from("reward_redemptions")
    .select(
      "id, partner_id, volunteer_code_snapshot, volunteer_name_snapshot, volunteer_email_snapshot, reward_name_snapshot, partner_name_snapshot, points_cost, status, redeemed_at, issued_at",
    )
    .order("redeemed_at", { ascending: false })
    .limit(250);

  if (selectedPartnerId) {
    redemptionsQuery = redemptionsQuery.eq("partner_id", selectedPartnerId);
  }

  const redemptionsResult = await redemptionsQuery;
  if (redemptionsResult.error) {
    throw new Error("Reward redemptions could not be loaded");
  }

  const rows = redemptionsResult.data ?? [];
  const activeRows = rows.filter(
    (row) => row.status === "pending_fulfilment" || row.status === "issued",
  );
  const issuedRows = rows.filter((row) => row.status === "issued");
  const pointsRedeemed = activeRows.reduce(
    (sum, row) => sum + Number(row.points_cost),
    0,
  );

  const exportHref = selectedPartnerId
    ? `/admin/rewards/export?partner=${encodeURIComponent(selectedPartnerId)}`
    : "/admin/rewards/export";

  return (
    <>
      <div className="dashboard-header">
        <div>
          <h1>Rewards & redemptions</h1>
          <p className="muted">
            Reconcile reward usage, see who redeemed, and produce sponsor-ready
            audit exports. Reward and voucher setup remains separate from the
            immutable redemption history.
          </p>
        </div>
        <div className="actions">
          <Link className="button button-primary" href={exportHref}>
            Export sponsor CSV
          </Link>
          <Link className="button button-secondary" href="/admin/points">
            Points management
          </Link>
        </div>
      </div>

      <section className="metric-grid" aria-label="Redemption summary">
        <article className="metric-card">
          <strong className="metric-value">{rows.length}</strong>
          <span className="metric-label">Recorded redemptions</span>
        </article>
        <article className="metric-card">
          <strong className="metric-value">{activeRows.length}</strong>
          <span className="metric-label">Active redemptions</span>
        </article>
        <article className="metric-card">
          <strong className="metric-value">{issuedRows.length}</strong>
          <span className="metric-label">Issued rewards</span>
        </article>
        <article className="metric-card">
          <strong className="metric-value">{formatPoints(pointsRedeemed)}</strong>
          <span className="metric-label">Points redeemed</span>
        </article>
      </section>

      <section className="section" aria-labelledby="partner-filter-title">
        <h2 id="partner-filter-title">Sponsor / partner</h2>
        <form method="get" className="phaseone-admin-form">
          <div className="form-field">
            <label htmlFor="reward-partner-filter">Filter redemptions</label>
            <select
              id="reward-partner-filter"
              name="partner"
              defaultValue={selectedPartnerId ?? ""}
            >
              <option value="">All partners</option>
              {(partnersResult.data ?? []).map((partner) => (
                <option key={partner.id} value={partner.id}>
                  {partner.name}
                  {partner.status === "inactive" ? " (inactive)" : ""}
                </option>
              ))}
            </select>
          </div>
          <div className="actions">
            <button className="button button-secondary" type="submit">
              Apply filter
            </button>
          </div>
        </form>
      </section>

      {(partnersResult.data ?? []).length === 0 ? (
        <section className="panel empty-state">
          <h2>No reward partners configured yet</h2>
          <p>
            The redemption system is ready, but sponsors and reward offers have
            not been added on staging yet.
          </p>
        </section>
      ) : null}

      <section className="section" aria-labelledby="redemption-audit-title">
        <h2 id="redemption-audit-title">Redemption audit</h2>
        {rows.length === 0 ? (
          <div className="panel empty-state">
            <p>No redemptions match this view.</p>
          </div>
        ) : (
          <div className="record-list">
            {rows.map((row) => (
              <article className="record-card" key={row.id}>
                <div>
                  <p className="record-kicker">
                    {row.partner_name_snapshot} · {row.volunteer_code_snapshot}
                  </p>
                  <h3>{row.reward_name_snapshot}</h3>
                  <p className="record-meta">
                    {row.volunteer_name_snapshot ?? "Volunteer"}
                    {row.volunteer_email_snapshot
                      ? ` · ${row.volunteer_email_snapshot}`
                      : ""}
                    {" · "}
                    {formatSingaporeDateTime(row.redeemed_at)}
                    {" · "}
                    {formatPoints(Number(row.points_cost))} points
                  </p>
                </div>
                <span
                  className="status-pill"
                  data-state={
                    row.status === "cancelled" || row.status === "refunded"
                      ? "cancelled"
                      : row.status === "pending_fulfilment"
                        ? "pending"
                        : "verified"
                  }
                >
                  {String(row.status).replaceAll("_", " ")}
                </span>
              </article>
            ))}
          </div>
        )}
      </section>
    </>
  );
}
