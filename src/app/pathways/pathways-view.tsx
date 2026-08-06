import Link from "next/link";

import type { PathwayMapVersion } from "@/lib/pathways/types";

import styles from "./pathways.module.css";
import { PathwaysTree } from "./pathways-tree";

type PathwaysViewProps = Readonly<{
  pathwayMap: PathwayMapVersion;
  isSignedIn: boolean;
  preview?: boolean;
  currentStageKey?: string | null;
}>;

export function PathwaysView({
  pathwayMap,
  isSignedIn,
  preview = false,
  currentStageKey = null,
}: PathwaysViewProps) {
  return (
    <>
      <main className={styles.frame}>
        {preview ? (
          <div className="notice" role="status">
            Administrative preview of {pathwayMap.status} version{" "}
            {pathwayMap.versionNumber}. Volunteers continue to see the active
            published version.
          </div>
        ) : null}

        <section className={styles.hero} aria-labelledby="pathways-title">
          <div className={styles.heroCopy}>
            <p className={styles.heroEyebrow}>{pathwayMap.name}</p>
            <h1 id="pathways-title">See where volunteering could take you.</h1>
            <p className={styles.heroLede}>{pathwayMap.introduction}</p>
            <div className={styles.heroActions}>
              <a className="button button-primary" href="#skill-tree-title">
                Explore the skill tree
              </a>
              <Link className="button button-secondary" href="/opportunities">
                Find an opportunity
              </Link>
            </div>
          </div>

          <div className={styles.positionCard}>
            <div className={styles.positionMark} aria-hidden="true">E</div>
            <div>
              <span className={styles.positionLabel}>
                {preview
                  ? "Starting position"
                  : isSignedIn
                    ? "Your current position"
                    : "Starting position"}
              </span>
              <strong>{pathwayMap.explorerTitle}</strong>
              <p>Starting point · {pathwayMap.tracks.length} pathways ahead</p>
            </div>
          </div>

          {!preview ? (
            <p className={styles.prototypeNote} role="note">
              Individual stage assignments are planned for a future release. Until
              then, every volunteer is shown at the shared Explorer starting point.
            </p>
          ) : null}
        </section>

        <PathwaysTree
          pathwayMap={pathwayMap}
          currentStageKey={currentStageKey}
          showPersonalPosition={!preview && isSignedIn}
        />

        <section className={styles.howItWorks} aria-labelledby="progress-title">
          <div>
            <p className="eyebrow">How progress works</p>
            <h2 id="progress-title">A guide, not a ranking.</h2>
          </div>
          <div className={styles.principles}>
            <article>
              <span>01</span>
              <h3>Explore freely</h3>
              <p>View every pathway without committing to only one direction.</p>
            </article>
            <article>
              <span>02</span>
              <h3>Build experience</h3>
              <p>Relevant activities can provide evidence toward a pathway role.</p>
            </article>
            <article>
              <span>03</span>
              <h3>Confirm progress</h3>
              <p>Only reviewed criteria should change an official pathway position.</p>
            </article>
          </div>
        </section>
      </main>
      <footer className="site-footer">{pathwayMap.footerNote}</footer>
    </>
  );
}
