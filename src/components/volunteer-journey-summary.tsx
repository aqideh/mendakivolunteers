import Link from "next/link";
import { formatPoints } from "@/lib/gamification/read-model";
import {
  VolunteerBadgeGallery,
  type VolunteerBadgeAward,
  type VolunteerBadgeDefinition,
} from "@/components/volunteer-badge-gallery";
import { createClient } from "@/lib/supabase/server";

type BadgeSnapshot = {
  linked: boolean;
  badges: VolunteerBadgeAward[];
  catalogue: VolunteerBadgeDefinition[];
};

type PointsSnapshot = {
  linked: boolean;
  balance: number | string;
};

type PositionRow = {
  id: string;
  map_id: string;
  track_stable_key: string;
  stage_stable_key: string;
  track_name_snapshot: string;
  stage_title_snapshot: string;
  effective_from: string;
};

type PathwaySnapshot = {
  linked: boolean;
  positions: PositionRow[];
};

export async function VolunteerJourneySummary({ approvedMinutes }: { approvedMinutes: number }) {
  const supabase = await createClient();

  const [pointsResult, badgesResult, positionsResult] = await Promise.all([
    supabase.schema("core").rpc("get_current_points_snapshot"),
    supabase.schema("core").rpc("get_current_badges_snapshot"),
    supabase.schema("core").rpc("get_current_pathway_positions_snapshot"),
  ]);

  if (pointsResult.error || badgesResult.error || positionsResult.error) {
    console.error("Unable to load volunteer journey summary", {
      pointsCode: pointsResult.error?.code,
      badgesCode: badgesResult.error?.code,
      positionsCode: positionsResult.error?.code,
    });
    return null;
  }

  const points = pointsResult.data as PointsSnapshot | null;
  const badges = badgesResult.data as BadgeSnapshot | null;
  const pathwaySnapshot = positionsResult.data as PathwaySnapshot | null;
  const positions = pathwaySnapshot?.positions ?? [];
  const badgeRows = badges?.badges ?? [];
  const badgeCatalogue = badges?.catalogue ?? [];

  const hours = approvedMinutes / 60;
  const nextMilestone = [15, 30, 60].find((target) => hours < target);

  return (
    <section className="section" aria-labelledby="journey-summary-title">
      <p className="eyebrow">Your volunteer journey</p>
      <h2 id="journey-summary-title">Progress at a glance</h2>
      <div className="metric-grid">
        <article className="metric-card">
          <span className="metric-value">
            {formatPoints(Number(points?.balance ?? 0))}
          </span>
          <span className="metric-label">Points</span>
        </article>
        <article className="metric-card">
          <span className="metric-value">{badgeRows.length}</span>
          <span className="metric-label">Active badges</span>
        </article>
        <article className="metric-card">
          <span className="metric-value">{positions.length}</span>
          <span className="metric-label">Pathway positions</span>
        </article>
      </div>

      <div className="card-grid">
        <VolunteerBadgeGallery
          badges={badgeRows}
          catalogue={badgeCatalogue}
          approvedHours={hours}
          nextMilestone={nextMilestone}
        />

        <article className="card">
          <h3>Pathway status</h3>
          {positions.length ? (
            <ul className="phaseone-compact-list">
              {positions.map((position) => (
                <li key={position.id}>
                  <strong>{position.track_name_snapshot}</strong>
                  <span className="muted">{position.stage_title_snapshot}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted">
              You are currently at the Explorer starting point. A pathway manager
              can confirm positions when there is reviewed evidence.
            </p>
          )}
          <Link className="text-link" href="/pathways">
            Open your pathway map
          </Link>
        </article>
      </div>
    </section>
  );
}
