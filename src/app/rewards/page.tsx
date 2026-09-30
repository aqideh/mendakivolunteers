import { randomUUID } from "node:crypto";

import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";

import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { formatPoints } from "@/lib/gamification/read-model";
import { createClient } from "@/lib/supabase/server";
import { redeemReward } from "./actions";

export const metadata: Metadata = {
  title: "Redeem points",
  description: "Redeem KELUARGA points for available volunteer rewards.",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

type Reward = {
  id: string;
  name: string;
  description: string;
  terms_text: string | null;
  points_cost: number | string;
  fulfilment_method: "voucher_code" | "manual";
  per_volunteer_limit: number;
  available_until: string | null;
  partner_name: string;
  can_redeem: boolean;
  unavailable_reason:
    | "limit_reached"
    | "out_of_stock"
    | "insufficient_points"
    | null;
};

type Redemption = {
  id: string;
  reward_name: string;
  partner_name: string;
  points_cost: number | string;
  status: "pending_fulfilment" | "issued" | "cancelled" | "refunded";
  redeemed_at: string;
  issued_at: string | null;
  voucher_code: string | null;
  voucher_expires_at: string | null;
};

type RewardsSnapshot = {
  linked: boolean;
  balance: number | string;
  rewards: Reward[];
  redemptions: Redemption[];
};

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

function redemptionStatus(status: Redemption["status"]): string {
  switch (status) {
    case "pending_fulfilment":
      return "Pending fulfilment";
    case "issued":
      return "Issued";
    case "cancelled":
      return "Cancelled";
    case "refunded":
      return "Refunded";
  }
}

function unavailableReason(reason: Reward["unavailable_reason"]): string {
  switch (reason) {
    case "limit_reached":
      return "Redemption limit reached";
    case "out_of_stock":
      return "Currently unavailable";
    case "insufficient_points":
      return "Not enough points";
    default:
      return "Unavailable";
  }
}

const errorMessages: Record<string, string> = {
  invalid_request: "The reward could not be identified.",
  reward_unavailable: "This reward is no longer available.",
  insufficient_points: "You do not have enough points for this reward.",
  limit_reached: "You have reached the redemption limit for this reward.",
  out_of_stock: "This reward is currently out of stock.",
  volunteer_profile_required:
    "Your volunteer profile must be linked before you can redeem points.",
  account_inactive: "Your account is not active.",
  redemption_failed:
    "The redemption could not be completed. No points were deducted.",
};

export default async function RewardsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();

  if (claimsError || !claimsData?.claims?.sub) {
    redirect(`/login?next=${encodeURIComponent("/rewards")}`);
  }

  const client = supabase as unknown as SupabaseClient;
  const { data, error } = await client
    .schema("core")
    .rpc("get_current_rewards_snapshot");

  if (error) {
    console.error("Unable to load rewards snapshot", { code: error.code });
    throw new Error("Rewards could not be loaded");
  }

  const snapshot = (data as RewardsSnapshot | null) ?? {
    linked: false,
    balance: 0,
    rewards: [],
    redemptions: [],
  };

  const parameters = await searchParams;
  const errorCode = parameter(parameters, "error");
  const success = parameter(parameters, "success");

  return (
    <div className="site-shell">
      <PortalHeader status="Redeem points" dashboard />

      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <h1>Redeem your points</h1>
            <p className="muted">
              Use points earned through KELUARGA recognition for available rewards.
              Every redemption is recorded in your points history.
            </p>
          </div>
          <div className="actions">
            <Link className="button button-secondary" href="/points">
              Points history
            </Link>
            <Link className="button button-secondary" href="/dashboard">
              Back to My Profile
            </Link>
          </div>
        </div>

        {success === "redeemed" ? (
          <div className="notice notice-success" role="status">
            Your reward has been redeemed and the points deduction has been recorded.
          </div>
        ) : null}

        {errorCode ? (
          <div className="notice notice-error" role="alert">
            {errorMessages[errorCode] ?? errorMessages.redemption_failed}
          </div>
        ) : null}

        <section className="panel" aria-labelledby="reward-balance-title">
          <h2 id="reward-balance-title">
            {formatPoints(Number(snapshot.balance))} points available
          </h2>
          <p className="muted">
            Reward redemptions deduct points immediately and appear in your audited
            points history.
          </p>
        </section>

        {!snapshot.linked ? (
          <section className="panel empty-state" aria-labelledby="rewards-profile-title">
            <h2 id="rewards-profile-title">Your volunteer profile is not ready yet</h2>
            <p>
              A linked KELUARGA volunteer profile is required before points can be
              redeemed.
            </p>
          </section>
        ) : snapshot.rewards.length === 0 ? (
          <section className="panel empty-state" aria-labelledby="rewards-pending-title">
            <h2 id="rewards-pending-title">Rewards are being finalised</h2>
            <p>
              Partner rewards and voucher details are still being confirmed. Your
              points remain available and no action is needed.
            </p>
          </section>
        ) : (
          <section className="section" aria-labelledby="available-rewards-title">
            <h2 id="available-rewards-title">Available rewards</h2>
            <div className="card-grid">
              {snapshot.rewards.map((reward) => (
                <article className="card" key={reward.id}>
                  <p className="record-kicker">{reward.partner_name}</p>
                  <h3>{reward.name}</h3>
                  <p>{reward.description}</p>
                  <p>
                    <strong>{formatPoints(Number(reward.points_cost))} points</strong>
                  </p>
                  {reward.available_until ? (
                    <p className="muted">
                      Available until {formatSingaporeDateTime(reward.available_until)}
                    </p>
                  ) : null}
                  {reward.terms_text ? (
                    <details>
                      <summary>Terms</summary>
                      <p>{reward.terms_text}</p>
                    </details>
                  ) : null}
                  {reward.can_redeem ? (
                    <form action={redeemReward}>
                      <input type="hidden" name="rewardId" value={reward.id} />
                      <input type="hidden" name="requestId" value={randomUUID()} />
                      <button className="button button-primary" type="submit">
                        Redeem
                      </button>
                    </form>
                  ) : (
                    <span className="status-pill" data-state="pending">
                      {unavailableReason(reward.unavailable_reason)}
                    </span>
                  )}
                </article>
              ))}
            </div>
          </section>
        )}

        <section className="section" aria-labelledby="redemption-history-title">
          <h2 id="redemption-history-title">Redemption history</h2>
          {snapshot.redemptions.length === 0 ? (
            <div className="panel empty-state">
              <p>You have not redeemed any rewards yet.</p>
            </div>
          ) : (
            <div className="record-list">
              {snapshot.redemptions.map((redemption) => (
                <article className="record-card" key={redemption.id}>
                  <div>
                    <p className="record-kicker">{redemption.partner_name}</p>
                    <h3>{redemption.reward_name}</h3>
                    <p className="record-meta">
                      Redeemed {formatSingaporeDateTime(redemption.redeemed_at)}
                      {" · "}
                      {formatPoints(Number(redemption.points_cost))} points
                    </p>
                    {redemption.voucher_code ? (
                      <p>
                        Voucher code: <strong>{redemption.voucher_code}</strong>
                        {redemption.voucher_expires_at
                          ? ` · Expires ${formatSingaporeDateTime(redemption.voucher_expires_at)}`
                          : ""}
                      </p>
                    ) : null}
                  </div>
                  <span
                    className="status-pill"
                    data-state={
                      redemption.status === "cancelled" ||
                      redemption.status === "refunded"
                        ? "cancelled"
                        : redemption.status === "pending_fulfilment"
                          ? "pending"
                          : "verified"
                    }
                  >
                    {redemptionStatus(redemption.status)}
                  </span>
                </article>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
