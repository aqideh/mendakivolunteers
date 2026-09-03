import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import {
  describePointRule,
  formatPointDelta,
  formatPointEntryKind,
  formatPoints,
  type PointCalculationMethod,
  type PointEntryKind,
} from "@/lib/gamification/read-model";
import { createClient } from "@/lib/supabase/server";
import { getYmHubSyncOutcome } from "@/lib/ymhub/read-model";
import type { AccountStatus, Database } from "@/types/database";

export const metadata: Metadata = {
  title: "Points",
  description:
    "View KELUARGA points derived from verified MENDAKI volunteer records.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PointRule = Readonly<{
  id: string;
  name: string;
  description: string;
  calculation_method: PointCalculationMethod;
  points_value: number;
  effective_from: string;
}>;

type PointLedgerEntry = Readonly<{
  id: string;
  source_record_id: string;
  source_title: string;
  source_occurred_at: string;
  entry_kind: PointEntryKind;
  points_delta: number;
  reason: string;
  created_at: string;
}>;

type PointsSnapshot = Readonly<{
  linked: boolean;
  balance: number;
  last_changed_at: string | null;
  active_rule: PointRule | null;
  entries: PointLedgerEntry[];
}>;

type YmHubSyncStatus =
  Database["ymhub"]["Tables"]["volunteer_sync_status"]["Row"];

function accountIsInactive(status: AccountStatus): boolean {
  return status === "suspended" || status === "closed";
}

export default async function PointsPage() {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect(`/login?next=${encodeURIComponent("/points")}`);
  }

  const [accountResult, volunteerResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("volunteers")
      .select("id")
      .eq("auth_user_id", userId)
      .maybeSingle(),
  ]);

  if (accountResult.error || volunteerResult.error || !accountResult.data) {
    console.error("Unable to load Points account context", {
      accountCode: accountResult.error?.code,
      volunteerCode: volunteerResult.error?.code,
      userId,
    });
    throw new Error("Points account context could not be loaded");
  }

  if (accountIsInactive(accountResult.data.status)) {
    redirect("/login?error=account_inactive");
  }

  const volunteer = volunteerResult.data;
  let pointsSnapshot: PointsSnapshot | null = null;
  let syncStatus: YmHubSyncStatus | null = null;

  if (volunteer) {
    const accountClient = supabase as unknown as SupabaseClient;
    const [pointsResult, syncResult] = await Promise.all([
      accountClient.schema("core").rpc("get_current_points_snapshot"),
      supabase
        .schema("ymhub")
        .from("volunteer_sync_status")
        .select(
          "volunteer_id, registrations_synced_at, attendance_synced_at, last_attempted_at, last_successful_at, last_failed_at, created_at, updated_at",
        )
        .eq("volunteer_id", volunteer.id)
        .maybeSingle(),
    ]);

    if (pointsResult.error || syncResult.error) {
      console.error("Unable to load volunteer points", {
        pointsCode: pointsResult.error?.code,
        syncCode: syncResult.error?.code,
        userId,
      });
      throw new Error("Volunteer points could not be loaded");
    }

    pointsSnapshot = (pointsResult.data as PointsSnapshot | null) ?? null;
    syncStatus = syncResult.data;
  }

  const activeRule = pointsSnapshot?.active_rule ?? null;
  const entries = pointsSnapshot?.entries ?? [];
  const syncOutcome = getYmHubSyncOutcome(syncStatus);
  const pointsBalance = Number(pointsSnapshot?.balance ?? 0);

  return (
    <div className="site-shell">
      <PortalHeader status="Your points" dashboard />

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <p className="eyebrow">KELUARGA recognition</p>
            <h1>Your points</h1>
            <p className="muted">
              Points are calculated in KELUARGA from eligible records that have
              been verified in YM Hub. Event-day roster check-in alone does not
              award points.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/dashboard">
              Back to dashboard
            </Link>
            <Link className="button button-secondary" href="/opportunities">
              Browse opportunities
            </Link>
          </div>
        </div>

        {!volunteer ? (
          <section className="panel empty-state" aria-labelledby="points-link-title">
            <h2 id="points-link-title">Official profile matching is in progress</h2>
            <p>
              Your KELUARGA account must be matched to your official YM Hub
              volunteer profile before personal points can be shown. You can still
              browse opportunities and news while this is being completed.
            </p>
            <div className="actions">
              <Link className="button button-primary" href="/opportunities">
                Browse opportunities
              </Link>
              <Link className="button button-secondary" href="/news">
                Read volunteer news
              </Link>
            </div>
          </section>
        ) : (
          <>
            <section className="panel" aria-labelledby="points-balance-title">
              <p className="eyebrow">Current balance</p>
              <h2 id="points-balance-title">{formatPoints(pointsBalance)} points</h2>
              <p className="muted">
                {pointsSnapshot?.last_changed_at
                  ? `Last changed ${formatSingaporeDateTime(pointsSnapshot.last_changed_at)}.`
                  : "No point transaction has been recorded yet."}
              </p>
            </section>

            {syncOutcome === "not_synced" ? (
              <div className="notice" role="status">
                <h2>Official attendance has not been imported yet</h2>
                <p>
                  Your balance will remain unchanged until the first successful YM
                  Hub attendance update and point reconciliation are completed.
                </p>
              </div>
            ) : null}

            {syncOutcome === "failed" ? (
              <div className="notice notice-error" role="alert">
                <h2>The latest YM Hub update did not complete</h2>
                <p>
                  The balance shown is based on the latest successful authoritative
                  data. No points are inferred from the staff roster as a fallback.
                </p>
              </div>
            ) : null}

            {!activeRule ? (
              <div className="notice" role="status">
                <h2>The points programme is being configured</h2>
                <p>
                  No attendance rule is active yet, so verified records will not
                  generate points until MENDAKI approves and activates a rule.
                </p>
              </div>
            ) : (
              <section className="section" aria-labelledby="active-rule-title">
                <p className="eyebrow">How points are calculated</p>
                <h2 id="active-rule-title">{activeRule.name}</h2>
                <p>{activeRule.description}</p>
                <p className="muted">
                  {describePointRule(
                    activeRule.calculation_method,
                    Number(activeRule.points_value),
                  )}
                  . Effective from {formatSingaporeDateTime(activeRule.effective_from)}.
                </p>
              </section>
            )}

            <section className="section" aria-labelledby="point-history-title">
              <p className="eyebrow">Audit trail</p>
              <h2 id="point-history-title">Point history</h2>
              {entries.length === 0 ? (
                <div className="panel empty-state">
                  <p>
                    No point transactions are available. Only eligible, verified YM
                    Hub records can create a point award.
                  </p>
                </div>
              ) : (
                <div className="record-list">
                  {entries.map((entry) => (
                    <article className="record-card" key={entry.id}>
                      <div>
                        <p className="record-kicker">
                          {formatPointEntryKind(entry.entry_kind)}
                        </p>
                        <h3>{entry.source_title}</h3>
                        <p className="record-meta">
                          Activity {formatSingaporeDateTime(entry.source_occurred_at)}
                          {" · "}
                          {entry.reason}
                        </p>
                      </div>
                      <span
                        className="status-pill"
                        data-state={entry.points_delta < 0 ? "cancelled" : "verified"}
                      >
                        {formatPointDelta(Number(entry.points_delta))}
                      </span>
                    </article>
                  ))}
                </div>
              )}
            </section>
          </>
        )}
      </main>

      <footer className="site-footer">
        YM Hub remains the source of truth for verified attendance and hours.
        KELUARGA applies the approved point rules and retains the point ledger.
      </footer>
    </div>
  );
}
