import "server-only";

import { cache } from "react";

import {
  createClient as createSupabaseClient,
  type SupabaseClient,
} from "@supabase/supabase-js";
import { z } from "zod";

import { getPublicConfig } from "@/lib/env";

export const landingPageKeys = [
  "home",
  "coach",
  "facilitator",
  "mentor",
  "specialist",
  "contributor",
] as const;

export type LandingPageKey = (typeof landingPageKeys)[number];

export type LandingPageDefinition = Readonly<{
  key: LandingPageKey;
  label: string;
  href: string;
  defaultImageUrl: string;
}>;

export const landingPageDefinitions: readonly LandingPageDefinition[] = [
  {
    key: "home",
    label: "Home",
    href: "/",
    defaultImageUrl: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "coach",
    label: "Coach",
    href: "/volunteer/coach",
    defaultImageUrl: "/volunteer/coach-hero.jpg",
  },
  {
    key: "facilitator",
    label: "Facilitator",
    href: "/volunteer/facilitator",
    defaultImageUrl: "/volunteer/facilitator-hero.jpg",
  },
  {
    key: "mentor",
    label: "Mentor",
    href: "/volunteer/mentor",
    defaultImageUrl: "/volunteer/mentor/mendaki-ampowered.png",
  },
  {
    key: "specialist",
    label: "Professional",
    href: "/volunteer/specialist",
    defaultImageUrl: "/home/keluarga-volunteers-hero.jpeg",
  },
  {
    key: "contributor",
    label: "Contributor",
    href: "/opportunities",
    defaultImageUrl: "/home/keluarga-volunteers-hero.jpeg",
  },
];

const rowSchema = z.object({
  page_key: z.enum(landingPageKeys),
  label: z.string().min(1),
  image_url: z.string().min(1),
  storage_path: z.string().nullable(),
  updated_at: z.string(),
});

export type LandingPageMedia = Readonly<{
  key: LandingPageKey;
  label: string;
  href: string;
  imageUrl: string;
  storagePath: string | null;
  updatedAt: string;
}>;

let publicClient: SupabaseClient | null = null;

function getLandingPageReadClient(): SupabaseClient {
  if (publicClient) return publicClient;

  const { supabaseUrl, supabasePublishableKey } = getPublicConfig();
  publicClient = createSupabaseClient(supabaseUrl, supabasePublishableKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  });

  return publicClient;
}

export function getLandingPageDefinition(
  key: LandingPageKey,
): LandingPageDefinition {
  const definition = landingPageDefinitions.find((item) => item.key === key);
  if (!definition) throw new Error("Unknown landing page.");
  return definition;
}

export const getLandingPageMedia = cache(async (): Promise<LandingPageMedia[]> => {
  const supabase = getLandingPageReadClient();
  const { data, error } = await supabase
    .schema("content")
    .from("landing_page_media")
    .select("page_key, label, image_url, storage_path, updated_at")
    .in("page_key", [...landingPageKeys]);

  if (error || !data) {
    console.error("Unable to load landing page media", {
      code: error?.code,
      message: error?.message,
    });
    throw new Error("Landing page photos could not be loaded.");
  }

  const rows = z.array(rowSchema).parse(data);
  const byKey = new Map(rows.map((row) => [row.page_key, row]));

  return landingPageDefinitions.map((definition) => {
    const row = byKey.get(definition.key);
    if (!row) {
      throw new Error(`Landing page photo is not configured for ${definition.label}.`);
    }

    return {
      key: definition.key,
      label: row.label,
      href: definition.href,
      imageUrl: row.image_url,
      storagePath: row.storage_path,
      updatedAt: row.updated_at,
    };
  });
});

export async function getLandingPageImage(
  key: LandingPageKey,
): Promise<string> {
  const media = await getLandingPageMedia();
  const page = media.find((item) => item.key === key);
  if (!page) throw new Error("Landing page photo could not be resolved.");
  return page.imageUrl;
}
