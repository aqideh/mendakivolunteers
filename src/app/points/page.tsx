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
  formatPointSourceKind,
  formatPoints,
  type PointCalculationMethod,
  type PointEntryKind,
  type PointSourceKind,
} from "@/lib/gamification/read-model";
import { createClient } from "@/lib/supabase/server";
import type { AccountStatus } from "@/types/database";

export const metadata: Metadata = {
  title: "Points",
  description:
    "View points earned from approved volunteering, milestones and engagement.",
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
  source_kind: PointSourceKind;
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

  if (volunteer) {
    const accountClient = supabase as unknown as SupabaseClient;
    const pointsResult = await accountClient
      .schema("core")
      .rpc("get_current_points_snapshot");

    if (pointsResult.error) {
      console.error("Unable to load volunteer points", {
        pointsCode: pointsResult.error.code,
        userId,
      });
      throw new Error("Volunteer points could not be loaded");
    }

    pointsSnapshot = (pointsResult.data as PointsSnapshot | null) ?? null;
  }

  const activeRule = pointsSnapshot?.active_rule ?? null;
  const entries = pointsSnapshot?.entries ?? [];
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
              Earn points for MakLom-approved volunteering, milestones and small
              actions that help you stay connected. Check-in alone earns no points.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/dashboard">
              Back to My Profile
            </Link>
            <Link className="button button-secondary" href="/opportunities">
              Browse opportunities
            </Link>
          </div>
        </div>

        {!volunteer ? (
          <section className="panel empty-state" aria-labelledby="points-link-title">
            <h2 id="points-link-title">Your volunteer profile is not ready yet</h2>
            <p>
              Your KELUARGA account needs a linked KELUARGA volunteer profile before
              personal points can be shown. You can still browse opportunities and
              news while account setup is being resolved.
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

            <section className="panel" aria-labelledby="points-how-title">
              <h2 id="points-how-title">How you earn points</h2>
              <p>10 points per approved volunteer hour, including partial hours; 20 bonus
                for your first approved contribution; 50, 100 and 200 bonus points
                when you first reach 15, 30 and 60 approved hours.</p>
              <p>Exploring an opportunity earns 2 points once per week. Confirming
                your profile details earns 2 points once per month, and completing
                all profile milestones earns 20 points once.</p>
            </section>

            {!activeRule ? (
              <div className="notice" role="status">
                <h2>The points programme is being configured</h2>
                <p>
                  Recognition rules are being configured. Approved contributions remain
                  recorded in MakLom.
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
                    No point transactions are available yet.
                  </p>
                </div>
              ) : (
                <div className="record-list">
                  {entries.map((entry) => (
                    <article className="record-card" key={entry.id}>
                      <div>
                        <p className="record-kicker">
                          {formatPointEntryKind(entry.entry_kind)} ·{" "}
                          {formatPointSourceKind(entry.source_kind)}
                        </p>
                        <h3>{entry.source_title}</h3>
                        <p className="record-meta">
                          {formatPointSourceKind(entry.source_kind)}{" "}
                          {formatSingaporeDateTime(entry.source_occurred_at)}
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
        <span>Keluarga MENDAKI records point awards and corrections in an audited history. Volunteering points follow MakLom-approved contributions.</span>
        <span className="site-footer-copyright">
          © 2026{" "}
          <a href="https://www.mendaki.org.sg/" target="_blank" rel="noreferrer">
            Yayasan MENDAKI
          </a>
        </span>
      </footer>
    </div>
  );
}
