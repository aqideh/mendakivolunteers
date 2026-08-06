import { z } from "zod";

import {
  getPathwayStageKey,
  pathwayColorTokens,
  pathwayPhaseKeys,
  pathwayTrackKeys,
  type PathwayPhaseKey,
  type PathwayTrackKey,
} from "@/lib/pathways/constants";

const phaseKeySchema = z.enum(pathwayPhaseKeys);
const trackKeySchema = z.enum(pathwayTrackKeys);
const colorTokenSchema = z.enum(pathwayColorTokens);
const roleKeySchema = z.enum(["option-1", "option-2", "option-3"]);

const phaseSchema = z.object({
  stable_key: phaseKeySchema,
  name: z.string().trim().min(2).max(80),
  description: z.string().trim().min(10).max(500),
  sort_order: z.number().int().min(1).max(5),
});

const trackSchema = z.object({
  stable_key: trackKeySchema,
  name: z.string().trim().min(2).max(100),
  short_name: z.string().trim().min(2).max(40),
  description: z.string().trim().min(10).max(500),
  color_token: colorTokenSchema,
  sort_order: z.number().int().min(1).max(4),
});

const roleSchema = z.object({
  stable_key: roleKeySchema,
  name: z.string().trim().min(2).max(120),
  sort_order: z.number().int().min(1).max(3),
});

const stageSchema = z.object({
  stable_key: z.string().regex(/^[a-z0-9]+(?:[.-][a-z0-9]+)*$/).max(130),
  track_key: trackKeySchema,
  phase_key: phaseKeySchema,
  title: z.string().trim().min(2).max(180),
  description: z.string().trim().min(10).max(800),
  roles: z.array(roleSchema).min(1).max(3),
});

export const pathwayDraftSchema = z
  .object({
    name: z.string().trim().min(3).max(120),
    introduction: z.string().trim().min(20).max(1200),
    explorerTitle: z.string().trim().min(2).max(80),
    explorerDescription: z.string().trim().min(10).max(500),
    footerNote: z.string().trim().min(10).max(500),
    phases: z.array(phaseSchema).length(5),
    tracks: z.array(trackSchema).length(4),
    stages: z.array(stageSchema).length(20),
  })
  .superRefine((value, context) => {
    const phaseKeys = new Set(value.phases.map(({ stable_key }) => stable_key));
    const phaseOrders = new Set(value.phases.map(({ sort_order }) => sort_order));
    const trackKeys = new Set(value.tracks.map(({ stable_key }) => stable_key));
    const trackOrders = new Set(value.tracks.map(({ sort_order }) => sort_order));
    const stageKeys = new Set(value.stages.map(({ stable_key }) => stable_key));

    if (
      phaseKeys.size !== pathwayPhaseKeys.length ||
      !pathwayPhaseKeys.every((key) => phaseKeys.has(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["phases"],
        message: "The pathway draft must contain the five required phases.",
      });
    }

    if (phaseOrders.size !== pathwayPhaseKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["phases"],
        message: "Each phase must have a unique display order.",
      });
    }

    if (
      trackKeys.size !== pathwayTrackKeys.length ||
      !pathwayTrackKeys.every((key) => trackKeys.has(key))
    ) {
      context.addIssue({
        code: "custom",
        path: ["tracks"],
        message: "The pathway draft must contain the four required tracks.",
      });
    }

    if (trackOrders.size !== pathwayTrackKeys.length) {
      context.addIssue({
        code: "custom",
        path: ["tracks"],
        message: "Each track must have a unique display order.",
      });
    }

    for (const trackKey of pathwayTrackKeys) {
      for (const phaseKey of pathwayPhaseKeys) {
        const expectedKey = getPathwayStageKey(trackKey, phaseKey);
        const matchingStages = value.stages.filter(
          (stage) =>
            stage.stable_key === expectedKey &&
            stage.track_key === trackKey &&
            stage.phase_key === phaseKey,
        );

        if (matchingStages.length !== 1) {
          context.addIssue({
            code: "custom",
            path: ["stages"],
            message: `A single stage is required for ${trackKey} and ${phaseKey}.`,
          });
        }
      }
    }

    if (stageKeys.size !== value.stages.length) {
      context.addIssue({
        code: "custom",
        path: ["stages"],
        message: "Each pathway stage must have a unique key.",
      });
    }

    for (const [stageIndex, stage] of value.stages.entries()) {
      const roleKeys = new Set(stage.roles.map(({ stable_key }) => stable_key));
      const roleOrders = new Set(stage.roles.map(({ sort_order }) => sort_order));

      if (roleKeys.size !== stage.roles.length || roleOrders.size !== stage.roles.length) {
        context.addIssue({
          code: "custom",
          path: ["stages", stageIndex, "roles"],
          message: "Role options within a stage must be unique.",
        });
      }

      const hasContiguousRoleOrder = stage.roles.every(
        (role, roleIndex) =>
          role.sort_order === roleIndex + 1 &&
          role.stable_key === `option-${roleIndex + 1}`,
      );

      if (!hasContiguousRoleOrder) {
        context.addIssue({
          code: "custom",
          path: ["stages", stageIndex, "roles"],
          message: "Role options must be filled in order without gaps.",
        });
      }
    }
  });

function readText(formData: FormData, name: string): string {
  const value = formData.get(name);
  return typeof value === "string" ? value : "";
}

function readInteger(formData: FormData, name: string): number {
  return Number.parseInt(readText(formData, name), 10);
}

function readPhase(formData: FormData, key: PathwayPhaseKey) {
  return {
    stable_key: key,
    name: readText(formData, `phase.${key}.name`),
    description: readText(formData, `phase.${key}.description`),
    sort_order: readInteger(formData, `phase.${key}.sortOrder`),
  };
}

function readTrack(formData: FormData, key: PathwayTrackKey) {
  return {
    stable_key: key,
    name: readText(formData, `track.${key}.name`),
    short_name: readText(formData, `track.${key}.shortName`),
    description: readText(formData, `track.${key}.description`),
    color_token: readText(formData, `track.${key}.colorToken`),
    sort_order: readInteger(formData, `track.${key}.sortOrder`),
  };
}

function readStage(
  formData: FormData,
  trackKey: PathwayTrackKey,
  phaseKey: PathwayPhaseKey,
) {
  const stableKey = getPathwayStageKey(trackKey, phaseKey);
  const roles = [1, 2, 3]
    .map((order) => ({
      stable_key: `option-${order}`,
      name: readText(formData, `stage.${stableKey}.role.${order}`),
      sort_order: order,
    }))
    .filter(({ name }) => name.trim() !== "");

  return {
    stable_key: stableKey,
    track_key: trackKey,
    phase_key: phaseKey,
    title: readText(formData, `stage.${stableKey}.title`),
    description: readText(formData, `stage.${stableKey}.description`),
    roles,
  };
}

export function parsePathwayDraftForm(formData: FormData) {
  return pathwayDraftSchema.safeParse({
    name: readText(formData, "name"),
    introduction: readText(formData, "introduction"),
    explorerTitle: readText(formData, "explorerTitle"),
    explorerDescription: readText(formData, "explorerDescription"),
    footerNote: readText(formData, "footerNote"),
    phases: pathwayPhaseKeys.map((key) => readPhase(formData, key)),
    tracks: pathwayTrackKeys.map((key) => readTrack(formData, key)),
    stages: pathwayTrackKeys.flatMap((trackKey) =>
      pathwayPhaseKeys.map((phaseKey) => readStage(formData, trackKey, phaseKey)),
    ),
  });
}

export function getPathwayValidationMessage(error: z.ZodError): string {
  return error.issues[0]?.message ?? "The pathway draft is invalid.";
}
