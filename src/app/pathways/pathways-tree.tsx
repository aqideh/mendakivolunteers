"use client";

import { useMemo, useState } from "react";

import type { PathwayTrackKey } from "@/lib/pathways/constants";
import type {
  PathwayMapVersion,
  PathwayPhase,
  PathwayStage,
  PathwayTrack,
} from "@/lib/pathways/types";

import styles from "./pathways.module.css";

type TrackFilter = "all" | PathwayTrackKey;
type StageState = "completed" | "current" | "next" | "future";

type PathwaysTreeProps = Readonly<{
  pathwayMap: PathwayMapVersion;
  currentStageKey?: string | null;
  showPersonalPosition?: boolean;
}>;

function getStageState(
  stage: PathwayStage,
  currentStage: PathwayStage | undefined,
  phases: readonly PathwayPhase[],
): StageState {
  if (!currentStage) {
    return stage.phaseKey === phases[0]?.stableKey ? "next" : "future";
  }

  if (stage.stableKey === currentStage.stableKey) {
    return "current";
  }

  if (stage.trackKey !== currentStage.trackKey) {
    return stage.phaseKey === phases[0]?.stableKey ? "next" : "future";
  }

  const phaseOrder = new Map(phases.map((phase) => [phase.stableKey, phase.sortOrder]));
  const stageOrder = phaseOrder.get(stage.phaseKey) ?? Number.MAX_SAFE_INTEGER;
  const currentOrder = phaseOrder.get(currentStage.phaseKey) ?? Number.MAX_SAFE_INTEGER;

  if (stageOrder < currentOrder) {
    return "completed";
  }

  if (stageOrder === currentOrder + 1) {
    return "next";
  }

  return "future";
}

function getStateLabel(state: StageState): string {
  switch (state) {
    case "completed":
      return "Earlier stage";
    case "current":
      return "Current stage";
    case "next":
      return "Available to explore";
    case "future":
      return "Future possibility";
  }
}

export function PathwaysTree({
  pathwayMap,
  currentStageKey = null,
  showPersonalPosition = false,
}: PathwaysTreeProps) {
  const phases = useMemo(
    () => [...pathwayMap.phases].sort((left, right) => left.sortOrder - right.sortOrder),
    [pathwayMap.phases],
  );
  const tracks = useMemo(
    () => [...pathwayMap.tracks].sort((left, right) => left.sortOrder - right.sortOrder),
    [pathwayMap.tracks],
  );
  const stages = useMemo(
    () => pathwayMap.stages.filter(({ isActive }) => isActive),
    [pathwayMap.stages],
  );
  const currentStage = stages.find(({ stableKey }) => stableKey === currentStageKey);
  const initialStage = currentStage ?? stages.find(
    (stage) =>
      stage.trackKey === tracks[0]?.stableKey &&
      stage.phaseKey === phases[0]?.stableKey,
  ) ?? stages[0];

  const [trackFilter, setTrackFilter] = useState<TrackFilter>("all");
  const [selectedStageKey, setSelectedStageKey] = useState(
    initialStage?.stableKey ?? "",
  );

  const selectedStage =
    stages.find(({ stableKey }) => stableKey === selectedStageKey) ?? initialStage;
  const selectedTrack = selectedStage
    ? tracks.find(({ stableKey }) => stableKey === selectedStage.trackKey)
    : undefined;
  const selectedPhase = selectedStage
    ? phases.find(({ stableKey }) => stableKey === selectedStage.phaseKey)
    : undefined;

  function focusTrack(track: PathwayTrack) {
    setTrackFilter(track.stableKey);
    const firstStage = phases
      .map((phase) =>
        stages.find(
          (stage) =>
            stage.trackKey === track.stableKey &&
            stage.phaseKey === phase.stableKey,
        ),
      )
      .find(Boolean);

    if (firstStage) {
      setSelectedStageKey(firstStage.stableKey);
    }
  }

  return (
    <>
      <section className={styles.controls} aria-labelledby="pathway-filter-title">
        <div>
          <p className="eyebrow">Choose a view</p>
          <h2 id="pathway-filter-title">Explore every direction</h2>
          <p className="muted">
            Focus on one pathway or keep the complete skill tree in view.
          </p>
        </div>
        <div className={styles.filters} aria-label="Pathway filters">
          <button
            aria-pressed={trackFilter === "all"}
            className={styles.filter}
            data-color="all"
            onClick={() => setTrackFilter("all")}
            type="button"
          >
            All pathways
          </button>
          {tracks.map((track) => (
            <button
              aria-pressed={trackFilter === track.stableKey}
              className={styles.filter}
              data-color={track.colorToken}
              key={track.id}
              onClick={() => focusTrack(track)}
              type="button"
            >
              <span className={styles.filterDot} aria-hidden="true" />
              {track.shortName}
            </button>
          ))}
        </div>
      </section>

      <section className={styles.treeSection} aria-labelledby="skill-tree-title">
        <div className={styles.treeHeading}>
          <div>
            <p className="eyebrow">Your skill tree</p>
            <h2 id="skill-tree-title">Start curious. Grow with purpose.</h2>
          </div>
          <div className={styles.legend} aria-label="Progress legend">
            <span><i data-state="current" /> Current</span>
            <span><i data-state="completed" /> Earlier</span>
            <span><i data-state="next" /> Available</span>
            <span><i data-state="future" /> Future</span>
          </div>
        </div>

        <div className={styles.tree}>
          <article
            className={styles.explorerNode}
            aria-label={`Starting position: ${pathwayMap.explorerTitle}`}
          >
            {!currentStage ? (
              <span className={styles.currentBadge}>
                {showPersonalPosition ? "You are here" : "Start here"}
              </span>
            ) : null}
            <span className={styles.explorerMark} aria-hidden="true">E</span>
            <div>
              <p>Starting point</p>
              <h3>{pathwayMap.explorerTitle}</h3>
              <span>{pathwayMap.explorerDescription}</span>
            </div>
          </article>

          <div className={styles.branchStem} aria-hidden="true" />

          <div className={styles.trackLabels} aria-label="Pathway tracks">
            {tracks.map((track) => (
              <button
                aria-pressed={trackFilter === track.stableKey}
                className={styles.trackLabel}
                data-color={track.colorToken}
                data-focused={trackFilter === "all" || trackFilter === track.stableKey}
                key={track.id}
                onClick={() => focusTrack(track)}
                type="button"
                title={track.description}
              >
                <span aria-hidden="true" />
                {track.name}
              </button>
            ))}
          </div>

          <div className={styles.phaseList}>
            {phases.map((phase, phaseIndex) => (
              <section
                className={styles.phase}
                aria-labelledby={`phase-${phase.stableKey}`}
                key={phase.id}
              >
                <div className={styles.phaseHeading}>
                  <span>{String(phaseIndex + 1).padStart(2, "0")}</span>
                  <div>
                    <p>Phase</p>
                    <h3 id={`phase-${phase.stableKey}`}>{phase.name}</h3>
                    <span className={styles.phaseDescription}>{phase.description}</span>
                  </div>
                </div>

                <div className={styles.roleGrid}>
                  {tracks.map((track) => {
                    const stage = stages.find(
                      (candidate) =>
                        candidate.trackKey === track.stableKey &&
                        candidate.phaseKey === phase.stableKey,
                    );

                    if (!stage) {
                      return null;
                    }

                    const state = getStageState(stage, currentStage, phases);
                    const isSelected = selectedStage?.stableKey === stage.stableKey;

                    return (
                      <button
                        aria-label={`${stage.title}, ${track.name}, ${phase.name} phase`}
                        aria-pressed={isSelected}
                        className={styles.roleCard}
                        data-color={track.colorToken}
                        data-focused={trackFilter === "all" || trackFilter === track.stableKey}
                        data-state={state}
                        key={stage.id}
                        onClick={() => setSelectedStageKey(stage.stableKey)}
                        type="button"
                      >
                        <span className={styles.rolePath}>{track.name}</span>
                        <strong>{stage.title}</strong>
                        <span className={styles.roleState}>{getStateLabel(state)}</span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </section>

      {selectedStage && selectedTrack && selectedPhase ? (
        <aside
          className={styles.roleDetail}
          aria-live="polite"
          aria-labelledby="role-detail-title"
        >
          <div className={styles.detailAccent} data-color={selectedTrack.colorToken} />
          <div>
            <p className={styles.detailKicker}>
              {selectedTrack.name} · {selectedPhase.name}
            </p>
            <h2 id="role-detail-title">{selectedStage.title}</h2>
            <p>{selectedStage.description}</p>
            <p className={styles.roleOptions}>
              <strong>Role options:</strong>{" "}
              {selectedStage.roles.map(({ name }) => name).join(" · ")}
            </p>
          </div>
          <div className={styles.detailStatus}>
            <span>Pathway status</span>
            <strong>{getStateLabel(getStageState(selectedStage, currentStage, phases))}</strong>
          </div>
        </aside>
      ) : null}
    </>
  );
}
