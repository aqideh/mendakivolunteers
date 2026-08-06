import { describe, expect, it } from "vitest";

import {
  getPathwayStageKey,
  pathwayPhaseKeys,
  pathwayTrackKeys,
} from "@/lib/pathways/constants";
import { pathwayDraftSchema } from "@/lib/pathways/validation";

const validDraft = {
  name: "My Volunteer Pathways",
  introduction:
    "Every volunteer starts as an Explorer and can explore several development directions.",
  explorerTitle: "Explorer",
  explorerDescription: "Discover where your strengths can take you.",
  footerNote: "Pathways describe potential development and do not guarantee appointments.",
  phases: pathwayPhaseKeys.map((key, index) => ({
    stable_key: key,
    name: key,
    description: `Description for the ${key} pathway phase.`,
    sort_order: index + 1,
  })),
  tracks: pathwayTrackKeys.map((key, index) => ({
    stable_key: key,
    name: key,
    short_name: key,
    description: `Description for the ${key} pathway track.`,
    color_token: ["green", "purple", "teal", "yellow"][index],
    sort_order: index + 1,
  })),
  stages: pathwayTrackKeys.flatMap((trackKey) =>
    pathwayPhaseKeys.map((phaseKey) => ({
      stable_key: getPathwayStageKey(trackKey, phaseKey),
      track_key: trackKey,
      phase_key: phaseKey,
      title: `${trackKey} ${phaseKey}`,
      description: `Description for the ${trackKey} ${phaseKey} stage.`,
      roles: [
        {
          stable_key: "option-1",
          name: `${trackKey} volunteer`,
          sort_order: 1,
        },
      ],
    })),
  ),
};

describe("pathwayDraftSchema", () => {
  it("accepts a complete four-track, five-phase map", () => {
    expect(pathwayDraftSchema.safeParse(validDraft).success).toBe(true);
  });

  it("rejects duplicate track ordering", () => {
    const result = pathwayDraftSchema.safeParse({
      ...validDraft,
      tracks: validDraft.tracks.map((track) => ({ ...track, sort_order: 1 })),
    });

    expect(result.success).toBe(false);
  });

  it("requires at least one role option per stage", () => {
    const result = pathwayDraftSchema.safeParse({
      ...validDraft,
      stages: validDraft.stages.map((stage, index) =>
        index === 0 ? { ...stage, roles: [] } : stage,
      ),
    });

    expect(result.success).toBe(false);
  });

  it("requires role options to be contiguous", () => {
    const result = pathwayDraftSchema.safeParse({
      ...validDraft,
      stages: validDraft.stages.map((stage, index) =>
        index === 0
          ? {
              ...stage,
              roles: [
                stage.roles[0],
                {
                  stable_key: "option-3",
                  name: "Third option",
                  sort_order: 3,
                },
              ],
            }
          : stage,
      ),
    });

    expect(result.success).toBe(false);
  });
});
