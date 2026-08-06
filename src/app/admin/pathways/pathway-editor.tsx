import {
  getPathwayStageKey,
  pathwayColorTokens,
} from "@/lib/pathways/constants";
import type { PathwayMapVersion } from "@/lib/pathways/types";

import { savePathwayDraft } from "./actions";
import styles from "./pathways-admin.module.css";

type PathwayEditorProps = Readonly<{
  pathwayMap: PathwayMapVersion;
}>;

export function PathwayEditor({ pathwayMap }: PathwayEditorProps) {
  const phases = [...pathwayMap.phases].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );
  const tracks = [...pathwayMap.tracks].sort(
    (left, right) => left.sortOrder - right.sortOrder,
  );

  return (
    <form action={savePathwayDraft} className={styles.editorForm}>
      <input name="versionId" type="hidden" value={pathwayMap.versionId} />

      <section className="panel" aria-labelledby="pathway-map-settings-title">
        <p className="eyebrow">Map settings</p>
        <h2 id="pathway-map-settings-title">Volunteer-facing introduction</h2>
        <div className={styles.fieldGrid}>
          <label className={styles.field}>
            <span>Map name</span>
            <input
              defaultValue={pathwayMap.name}
              maxLength={120}
              minLength={3}
              name="name"
              required
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Introduction</span>
            <textarea
              defaultValue={pathwayMap.introduction}
              maxLength={1200}
              minLength={20}
              name="introduction"
              required
              rows={4}
            />
          </label>
          <label className={styles.field}>
            <span>Starting position title</span>
            <input
              defaultValue={pathwayMap.explorerTitle}
              maxLength={80}
              minLength={2}
              name="explorerTitle"
              required
            />
          </label>
          <label className={styles.field}>
            <span>Starting position description</span>
            <textarea
              defaultValue={pathwayMap.explorerDescription}
              maxLength={500}
              minLength={10}
              name="explorerDescription"
              required
              rows={3}
            />
          </label>
          <label className={`${styles.field} ${styles.fieldWide}`}>
            <span>Footer note</span>
            <textarea
              defaultValue={pathwayMap.footerNote}
              maxLength={500}
              minLength={10}
              name="footerNote"
              required
              rows={2}
            />
          </label>
        </div>
      </section>

      <section className="section panel" aria-labelledby="pathway-phases-title">
        <p className="eyebrow">Phase headers</p>
        <h2 id="pathway-phases-title">Five progression phases</h2>
        <div className={styles.phaseEditorGrid}>
          {phases.map((phase) => (
            <fieldset className={styles.editorCard} key={phase.id}>
              <legend>{phase.name}</legend>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  defaultValue={phase.name}
                  maxLength={80}
                  minLength={2}
                  name={`phase.${phase.stableKey}.name`}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Description</span>
                <textarea
                  defaultValue={phase.description}
                  maxLength={500}
                  minLength={10}
                  name={`phase.${phase.stableKey}.description`}
                  required
                  rows={4}
                />
              </label>
              <label className={styles.field}>
                <span>Display order</span>
                <input
                  defaultValue={phase.sortOrder}
                  max={5}
                  min={1}
                  name={`phase.${phase.stableKey}.sortOrder`}
                  required
                  type="number"
                />
              </label>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="section panel" aria-labelledby="pathway-tracks-title">
        <p className="eyebrow">Pathway tracks</p>
        <h2 id="pathway-tracks-title">Four volunteer directions</h2>
        <div className={styles.trackEditorGrid}>
          {tracks.map((track) => (
            <fieldset
              className={styles.editorCard}
              data-color={track.colorToken}
              key={track.id}
            >
              <legend>{track.name}</legend>
              <label className={styles.field}>
                <span>Name</span>
                <input
                  defaultValue={track.name}
                  maxLength={100}
                  minLength={2}
                  name={`track.${track.stableKey}.name`}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Short name</span>
                <input
                  defaultValue={track.shortName}
                  maxLength={40}
                  minLength={2}
                  name={`track.${track.stableKey}.shortName`}
                  required
                />
              </label>
              <label className={styles.field}>
                <span>Description</span>
                <textarea
                  defaultValue={track.description}
                  maxLength={500}
                  minLength={10}
                  name={`track.${track.stableKey}.description`}
                  required
                  rows={4}
                />
              </label>
              <div className={styles.twoColumnFields}>
                <label className={styles.field}>
                  <span>Colour</span>
                  <select
                    defaultValue={track.colorToken}
                    name={`track.${track.stableKey}.colorToken`}
                  >
                    {pathwayColorTokens.map((color) => (
                      <option key={color} value={color}>
                        {color[0]?.toUpperCase()}{color.slice(1)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className={styles.field}>
                  <span>Display order</span>
                  <input
                    defaultValue={track.sortOrder}
                    max={4}
                    min={1}
                    name={`track.${track.stableKey}.sortOrder`}
                    required
                    type="number"
                  />
                </label>
              </div>
            </fieldset>
          ))}
        </div>
      </section>

      <section className="section panel" aria-labelledby="pathway-stages-title">
        <p className="eyebrow">Skill-tree stages</p>
        <h2 id="pathway-stages-title">Roles at each track and phase</h2>
        <p className="muted">
          Each stage requires a display title, a short description, and between one
          and three role options.
        </p>
        <div className={styles.stageMatrix}>
          {phases.map((phase) => (
            <section className={styles.stagePhase} key={phase.id}>
              <div className={styles.stagePhaseHeading}>
                <p>Phase</p>
                <h3>{phase.name}</h3>
              </div>
              <div className={styles.stageGrid}>
                {tracks.map((track) => {
                  const stageKey = getPathwayStageKey(
                    track.stableKey,
                    phase.stableKey,
                  );
                  const stage = pathwayMap.stages.find(
                    ({ stableKey }) => stableKey === stageKey,
                  );

                  if (!stage) {
                    throw new Error(`Missing pathway stage ${stageKey}`);
                  }

                  return (
                    <fieldset
                      className={styles.stageCard}
                      data-color={track.colorToken}
                      key={stage.id}
                    >
                      <legend>{track.name}</legend>
                      <label className={styles.field}>
                        <span>Display title</span>
                        <input
                          defaultValue={stage.title}
                          maxLength={180}
                          minLength={2}
                          name={`stage.${stageKey}.title`}
                          required
                        />
                      </label>
                      <label className={styles.field}>
                        <span>Description</span>
                        <textarea
                          defaultValue={stage.description}
                          maxLength={800}
                          minLength={10}
                          name={`stage.${stageKey}.description`}
                          required
                          rows={4}
                        />
                      </label>
                      {[1, 2, 3].map((roleOrder) => (
                        <label className={styles.field} key={roleOrder}>
                          <span>
                            Role option {roleOrder}
                            {roleOrder === 1 ? " (required)" : " (optional)"}
                          </span>
                          <input
                            defaultValue={stage.roles[roleOrder - 1]?.name ?? ""}
                            maxLength={120}
                            minLength={roleOrder === 1 ? 2 : undefined}
                            name={`stage.${stageKey}.role.${roleOrder}`}
                            required={roleOrder === 1}
                          />
                        </label>
                      ))}
                    </fieldset>
                  );
                })}
              </div>
            </section>
          ))}
        </div>
      </section>

      <div className={styles.stickyActions}>
        <div>
          <strong>Draft version {pathwayMap.versionNumber}</strong>
          <span>Saving does not change the volunteer-facing map.</span>
        </div>
        <button className="button button-primary" type="submit">
          Save draft
        </button>
      </div>
    </form>
  );
}
