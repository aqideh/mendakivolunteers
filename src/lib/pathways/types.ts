import type {
  PathwayColorToken,
  PathwayPhaseKey,
  PathwayTrackKey,
} from "@/lib/pathways/constants";

export type PathwayPhase = Readonly<{
  id: string;
  stableKey: PathwayPhaseKey;
  name: string;
  description: string;
  sortOrder: number;
}>;

export type PathwayTrack = Readonly<{
  id: string;
  stableKey: PathwayTrackKey;
  name: string;
  shortName: string;
  description: string;
  colorToken: PathwayColorToken;
  sortOrder: number;
}>;

export type PathwayRoleOption = Readonly<{
  id: string;
  stableKey: string;
  name: string;
  sortOrder: number;
}>;

export type PathwayStage = Readonly<{
  id: string;
  stableKey: string;
  trackKey: PathwayTrackKey;
  phaseKey: PathwayPhaseKey;
  title: string;
  description: string;
  isActive: boolean;
  roles: readonly PathwayRoleOption[];
}>;

export type PathwayMapVersion = Readonly<{
  mapId: string;
  mapSlug: string;
  versionId: string;
  versionNumber: number;
  status: "draft" | "published" | "archived";
  name: string;
  introduction: string;
  explorerTitle: string;
  explorerDescription: string;
  footerNote: string;
  createdAt: string;
  updatedAt: string;
  publishedAt: string | null;
  phases: readonly PathwayPhase[];
  tracks: readonly PathwayTrack[];
  stages: readonly PathwayStage[];
}>;
