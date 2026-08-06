import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PATHWAY_MAP_SLUG,
  pathwayColorTokens,
  pathwayPhaseKeys,
  pathwayTrackKeys,
  type PathwayColorToken,
  type PathwayPhaseKey,
  type PathwayTrackKey,
} from "@/lib/pathways/constants";
import type { PathwayMapVersion } from "@/lib/pathways/types";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type PathwayClient = SupabaseClient<Database>;
type PathwayMapRow = Database["pathways"]["Tables"]["maps"]["Row"];
type PathwayVersionRow =
  Database["pathways"]["Tables"]["map_versions"]["Row"];

function isPhaseKey(value: string): value is PathwayPhaseKey {
  return (pathwayPhaseKeys as readonly string[]).includes(value);
}

function isTrackKey(value: string): value is PathwayTrackKey {
  return (pathwayTrackKeys as readonly string[]).includes(value);
}

function isColorToken(value: string): value is PathwayColorToken {
  return (pathwayColorTokens as readonly string[]).includes(value);
}

async function loadVersionChildren(
  supabase: PathwayClient,
  pathwayMap: PathwayMapRow,
  version: PathwayVersionRow,
): Promise<PathwayMapVersion> {
  const [phasesResult, tracksResult, stagesResult] = await Promise.all([
    supabase
      .schema("pathways")
      .from("phases")
      .select("id, stable_key, name, description, sort_order")
      .eq("version_id", version.id)
      .order("sort_order"),
    supabase
      .schema("pathways")
      .from("tracks")
      .select(
        "id, stable_key, name, short_name, description, color_token, sort_order",
      )
      .eq("version_id", version.id)
      .order("sort_order"),
    supabase
      .schema("pathways")
      .from("stages")
      .select(
        "id, stable_key, track_id, phase_id, title, description, is_active",
      )
      .eq("version_id", version.id),
  ]);

  if (phasesResult.error || tracksResult.error || stagesResult.error) {
    console.error("Unable to load pathway version structure", {
      versionId: version.id,
      phasesCode: phasesResult.error?.code,
      tracksCode: tracksResult.error?.code,
      stagesCode: stagesResult.error?.code,
    });
    throw new Error("Pathway map structure could not be loaded");
  }

  const phases = phasesResult.data ?? [];
  const tracks = tracksResult.data ?? [];
  const stages = stagesResult.data ?? [];
  const stageIds = stages.map(({ id }) => id);

  let roleRows: Database["pathways"]["Tables"]["stage_roles"]["Row"][] = [];

  if (stageIds.length > 0) {
    const rolesResult = await supabase
      .schema("pathways")
      .from("stage_roles")
      .select("id, stage_id, stable_key, name, sort_order")
      .in("stage_id", stageIds)
      .order("sort_order");

    if (rolesResult.error) {
      console.error("Unable to load pathway role options", {
        versionId: version.id,
        code: rolesResult.error.code,
      });
      throw new Error("Pathway role options could not be loaded");
    }

    roleRows = rolesResult.data ?? [];
  }

  const phaseKeyById = new Map<string, PathwayPhaseKey>();
  const trackKeyById = new Map<string, PathwayTrackKey>();

  const mappedPhases = phases.map((phase) => {
    if (!isPhaseKey(phase.stable_key)) {
      throw new Error(`Unsupported pathway phase key: ${phase.stable_key}`);
    }

    phaseKeyById.set(phase.id, phase.stable_key);
    return {
      id: phase.id,
      stableKey: phase.stable_key,
      name: phase.name,
      description: phase.description,
      sortOrder: phase.sort_order,
    };
  });

  const mappedTracks = tracks.map((track) => {
    if (!isTrackKey(track.stable_key)) {
      throw new Error(`Unsupported pathway track key: ${track.stable_key}`);
    }
    if (!isColorToken(track.color_token)) {
      throw new Error(`Unsupported pathway colour: ${track.color_token}`);
    }

    trackKeyById.set(track.id, track.stable_key);
    return {
      id: track.id,
      stableKey: track.stable_key,
      name: track.name,
      shortName: track.short_name,
      description: track.description,
      colorToken: track.color_token,
      sortOrder: track.sort_order,
    };
  });

  const rolesByStage = new Map<
    string,
    Array<{
      id: string;
      stableKey: string;
      name: string;
      sortOrder: number;
    }>
  >();

  for (const role of roleRows) {
    const stageRoles = rolesByStage.get(role.stage_id) ?? [];
    stageRoles.push({
      id: role.id,
      stableKey: role.stable_key,
      name: role.name,
      sortOrder: role.sort_order,
    });
    rolesByStage.set(role.stage_id, stageRoles);
  }

  const mappedStages = stages.map((stage) => {
    const trackKey = trackKeyById.get(stage.track_id);
    const phaseKey = phaseKeyById.get(stage.phase_id);

    if (!trackKey || !phaseKey) {
      throw new Error(`Pathway stage ${stage.stable_key} has invalid references`);
    }

    return {
      id: stage.id,
      stableKey: stage.stable_key,
      trackKey,
      phaseKey,
      title: stage.title,
      description: stage.description,
      isActive: stage.is_active,
      roles: (rolesByStage.get(stage.id) ?? []).sort(
        (left, right) => left.sortOrder - right.sortOrder,
      ),
    };
  });

  return {
    mapId: pathwayMap.id,
    mapSlug: pathwayMap.slug,
    versionId: version.id,
    versionNumber: version.version_number,
    status: version.status,
    name: version.name,
    introduction: version.introduction,
    explorerTitle: version.explorer_title,
    explorerDescription: version.explorer_description,
    footerNote: version.footer_note,
    createdAt: version.created_at,
    updatedAt: version.updated_at,
    publishedAt: version.published_at,
    phases: mappedPhases,
    tracks: mappedTracks,
    stages: mappedStages,
  };
}

export async function getPathwayMapRecord(
  supabase: PathwayClient,
  slug = PATHWAY_MAP_SLUG,
): Promise<PathwayMapRow | null> {
  const { data, error } = await supabase
    .schema("pathways")
    .from("maps")
    .select("id, slug, active_version_id, created_at, updated_at")
    .eq("slug", slug)
    .maybeSingle();

  if (error) {
    console.error("Unable to load pathway map", { slug, code: error.code });
    throw new Error("Pathway map could not be loaded");
  }

  return data;
}

export async function getPathwayMapVersion(
  supabase: PathwayClient,
  pathwayMap: PathwayMapRow,
  versionId: string,
): Promise<PathwayMapVersion | null> {
  const { data: version, error } = await supabase
    .schema("pathways")
    .from("map_versions")
    .select(
      "id, map_id, version_number, status, name, introduction, explorer_title, explorer_description, footer_note, created_by, published_by, published_at, created_at, updated_at",
    )
    .eq("id", versionId)
    .eq("map_id", pathwayMap.id)
    .maybeSingle();

  if (error) {
    console.error("Unable to load pathway map version", {
      versionId,
      code: error.code,
    });
    throw new Error("Pathway map version could not be loaded");
  }

  return version ? loadVersionChildren(supabase, pathwayMap, version) : null;
}

export async function getPublishedPathwayMap(
  client?: PathwayClient,
): Promise<PathwayMapVersion | null> {
  const supabase = client ?? (await createClient());
  const pathwayMap = await getPathwayMapRecord(supabase);

  if (!pathwayMap?.active_version_id) {
    return null;
  }

  return getPathwayMapVersion(supabase, pathwayMap, pathwayMap.active_version_id);
}
