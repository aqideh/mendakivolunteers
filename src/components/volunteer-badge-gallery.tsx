"use client";

import { useRef } from "react";

export type VolunteerBadgeAward = {
  award_id: string;
  badge_id: string;
  stable_key: string;
  name: string;
  description: string;
  awarded_at: string;
};

export type VolunteerBadgeDefinition = {
  badge_id: string;
  stable_key: string;
  name: string;
  description: string;
};

type VolunteerBadgeGalleryProps = Readonly<{
  badges: VolunteerBadgeAward[];
  catalogue: VolunteerBadgeDefinition[];
  approvedHours: number;
  nextMilestone: number | undefined;
}>;

type BadgeIconKind =
  | "steps"
  | "hands"
  | "shield"
  | "trophy"
  | "medal"
  | "profile"
  | "compass"
  | "community"
  | "star";

const iconKinds: Record<string, BadgeIconKind> = {
  "first-step": "steps",
  "helping-hand-15": "hands",
  "community-builder-30": "shield",
  "community-champion-60": "trophy",
  "mendaki-appreciation": "medal",
  "profile-complete": "profile",
  "opportunity-explorer": "compass",
  "one-keluarga": "community",
  "milestone-service": "medal",
};

function BadgeIcon({ stableKey }: { stableKey: string }) {
  const kind = iconKinds[stableKey] ?? "star";

  if (kind === "steps") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <ellipse cx="23" cy="40" rx="8" ry="13" transform="rotate(-28 23 40)" />
        <ellipse cx="41" cy="24" rx="8" ry="13" transform="rotate(24 41 24)" />
        <circle cx="13" cy="29" r="3" />
        <circle cx="48" cy="10" r="3" />
      </svg>
    );
  }

  if (kind === "hands") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 27c-8-8-17-3-17 5 0 8 8 14 17 20 9-6 17-12 17-20 0-8-9-13-17-5Z" className="badge-icon-accent" />
        <path d="M8 38c5 2 11 7 17 13M56 38c-5 2-11 7-17 13M12 30v13c0 6 5 11 12 14M52 30v13c0 6-5 11-12 14" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" />
      </svg>
    );
  }

  if (kind === "shield") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M32 7 52 15v15c0 13-8 23-20 29C20 53 12 43 12 30V15l20-8Z" />
        <path d="M32 44c-8-5-13-9-13-15 0-6 7-9 13-3 6-6 13-3 13 3 0 6-5 10-13 15Z" className="badge-icon-accent badge-icon-cutout" />
      </svg>
    );
  }

  if (kind === "trophy") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M19 10h26v10c0 11-5 18-13 21-8-3-13-10-13-21V10Z" className="badge-icon-accent" />
        <path d="M19 15H9c0 12 4 18 14 19M45 15h10c0 12-4 18-14 19M32 41v10M22 55h20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <path d="m32 17 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" className="badge-icon-cutout" />
      </svg>
    );
  }

  if (kind === "medal") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="m20 5 12 19L44 5h10L39 31H25L10 5h10Z" />
        <circle cx="32" cy="40" r="15" className="badge-icon-accent" />
        <path d="m32 31 3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6Z" className="badge-icon-cutout" />
      </svg>
    );
  }

  if (kind === "profile") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="27" cy="23" r="11" />
        <path d="M8 55c1-12 8-19 19-19s18 7 19 19H8Z" />
        <circle cx="47" cy="43" r="12" className="badge-icon-accent" />
        <path d="m42 43 4 4 7-9" fill="none" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" className="badge-icon-cutout" />
      </svg>
    );
  }

  if (kind === "compass") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <circle cx="32" cy="32" r="23" fill="none" stroke="currentColor" strokeWidth="5" />
        <path d="m41 18-6 17-12 11 6-17 12-11Z" className="badge-icon-accent" />
        <circle cx="32" cy="32" r="3" />
      </svg>
    );
  }

  if (kind === "community") {
    return (
      <svg viewBox="0 0 64 64" aria-hidden="true">
        <path d="M8 28 32 8l24 20" fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="32" cy="30" r="8" className="badge-icon-accent" />
        <circle cx="17" cy="37" r="6" />
        <circle cx="47" cy="37" r="6" />
        <path d="M20 56c1-10 5-15 12-15s11 5 12 15H20ZM5 56c1-8 5-12 12-12M59 56c-1-8-5-12-12-12" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 64 64" aria-hidden="true">
      <path d="m32 7 7 15 17 2-12 12 3 17-15-8-15 8 3-17L8 24l17-2 7-15Z" className="badge-icon-accent" />
    </svg>
  );
}

function BadgeEmblem({
  stableKey,
  earned,
}: {
  stableKey: string;
  earned: boolean;
}) {
  return (
    <span
      className="volunteer-badge-emblem"
      data-earned={earned ? "true" : "false"}
      aria-hidden="true"
    >
      <span className="volunteer-badge-emblem-inner">
        <BadgeIcon stableKey={stableKey} />
      </span>
    </span>
  );
}

export function VolunteerBadgeGallery({
  badges,
  catalogue,
  approvedHours,
  nextMilestone,
}: VolunteerBadgeGalleryProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const earnedByKey = new Map(badges.map((badge) => [badge.stable_key, badge]));
  const definitions = catalogue.length
    ? catalogue
    : badges.map(({ badge_id, stable_key, name, description }) => ({
        badge_id,
        stable_key,
        name,
        description,
      }));

  function openCatalogue() {
    dialogRef.current?.showModal();
  }

  function closeCatalogue() {
    dialogRef.current?.close();
  }

  return (
    <article className="volunteer-badge-panel">
      <button
        className="volunteer-badge-summary"
        type="button"
        onClick={openCatalogue}
        aria-haspopup="dialog"
      >
        <span className="volunteer-badge-summary-copy">
          <span>
            <strong>Badges</strong>
            <small>
              {badges.length
                ? `${badges.length} earned · Tap to view all badges`
                : "Tap to see the badges you can earn"}
            </small>
          </span>
          <span className="volunteer-badge-summary-arrow" aria-hidden="true">→</span>
        </span>

        {badges.length ? (
          <span className="volunteer-badge-earned-row" aria-label="Earned badges">
            {badges.map((badge) => (
              <span className="volunteer-badge-earned-item" key={badge.award_id}>
                <BadgeEmblem stableKey={badge.stable_key} earned />
                <span>{badge.name}</span>
              </span>
            ))}
          </span>
        ) : (
          <span className="volunteer-badge-empty">
            Your first badge appears when your first contribution is approved.
          </span>
        )}

        {nextMilestone ? (
          <span className="volunteer-badge-progress">
            <span>
              {approvedHours.toFixed(1)} of {nextMilestone} approved hours towards your next hours badge
            </span>
            <progress
              value={Math.min(approvedHours, nextMilestone)}
              max={nextMilestone}
              aria-label={`Progress towards ${nextMilestone} approved hours`}
            />
          </span>
        ) : (
          <span className="volunteer-badge-progress volunteer-badge-progress-complete">
            60-hour milestone achieved.
          </span>
        )}
      </button>

      <dialog
        ref={dialogRef}
        className="volunteer-badge-dialog"
        aria-labelledby="volunteer-badge-catalogue-title"
        onClick={(event) => {
          if (event.target === event.currentTarget) {
            closeCatalogue();
          }
        }}
      >
        <div className="volunteer-badge-dialog-card">
          <header className="volunteer-badge-dialog-header">
            <div>
              <h2 id="volunteer-badge-catalogue-title">Your badges</h2>
              <p>Earned badges are shown in colour. Badges still to unlock are greyed out.</p>
            </div>
            <button
              className="volunteer-badge-dialog-close"
              type="button"
              onClick={closeCatalogue}
              aria-label="Close badge catalogue"
            >
              ×
            </button>
          </header>

          <div className="volunteer-badge-catalogue">
            {definitions.map((definition) => {
              const earned = earnedByKey.get(definition.stable_key);

              return (
                <article
                  className="volunteer-badge-catalogue-item"
                  data-earned={earned ? "true" : "false"}
                  key={definition.badge_id}
                >
                  <BadgeEmblem stableKey={definition.stable_key} earned={Boolean(earned)} />
                  <div>
                    <span className="volunteer-badge-state">
                      {earned ? "Earned" : "Locked"}
                    </span>
                    <h3>{definition.name}</h3>
                    <p>{definition.description}</p>
                    {earned ? (
                      <small>
                        Earned{" "}
                        {new Intl.DateTimeFormat("en-SG", {
                          day: "numeric",
                          month: "short",
                          year: "numeric",
                          timeZone: "Asia/Singapore",
                        }).format(new Date(earned.awarded_at))}
                      </small>
                    ) : null}
                  </div>
                </article>
              );
            })}
          </div>
        </div>
      </dialog>
    </article>
  );
}
