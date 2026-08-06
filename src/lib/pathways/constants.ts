export const PATHWAY_MAP_SLUG = "volunteer-pathways";

export const pathwayPhaseKeys = [
  "explore",
  "contribute",
  "specialise",
  "lead",
  "champion",
] as const;

export const pathwayTrackKeys = [
  "mentor",
  "educator",
  "connector",
  "professional",
] as const;

export const pathwayColorTokens = [
  "green",
  "purple",
  "teal",
  "yellow",
] as const;

export type PathwayPhaseKey = (typeof pathwayPhaseKeys)[number];
export type PathwayTrackKey = (typeof pathwayTrackKeys)[number];
export type PathwayColorToken = (typeof pathwayColorTokens)[number];

export function getPathwayStageKey(
  trackKey: PathwayTrackKey,
  phaseKey: PathwayPhaseKey,
): `${PathwayTrackKey}.${PathwayPhaseKey}` {
  return `${trackKey}.${phaseKey}`;
}
