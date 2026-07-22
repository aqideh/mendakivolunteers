import { createHash } from "node:crypto";

import { z } from "zod";

const volunteerGovHost = "volunteer.gov.sg";
const volunteerGovBaseUrl = `https://www.${volunteerGovHost}`;

const listingSchema = z.object({
  name: z.string().trim().min(1),
  description: z.string().optional(),
  image: z.union([z.string(), z.array(z.string())]).optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  location: z
    .union([
      z.string(),
      z.object({
        name: z.string().optional(),
        address: z
          .union([
            z.string(),
            z.object({
              streetAddress: z.string().optional(),
              addressLocality: z.string().optional(),
              postalCode: z.string().optional(),
            }),
          ])
          .optional(),
      }),
    ])
    .optional(),
  url: z.string().url(),
  dateModified: z.string().optional(),
});

type JsonRecord = Record<string, unknown>;

export type ImportedOpportunity = Readonly<{
  source_key: string;
  title: string;
  summary: string | null;
  image_url: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue: string | null;
  source_url: string;
  source_updated_at: string | null;
  imported_at: string;
  is_active: true;
  raw_payload: JsonRecord;
}>;

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isVolunteerGovSgHost(hostname: string): boolean {
  return hostname === volunteerGovHost || hostname === `www.${volunteerGovHost}`;
}

function flattenJsonLd(value: unknown): JsonRecord[] {
  if (Array.isArray(value)) {
    return value.flatMap(flattenJsonLd);
  }

  if (!isRecord(value)) {
    return [];
  }

  const graph = value["@graph"];
  return graph ? [value, ...flattenJsonLd(graph)] : [value];
}

function readJsonLd(html: string): JsonRecord[] {
  const scripts = html.matchAll(
    /<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  );
  const records: JsonRecord[] = [];

  for (const match of scripts) {
    const payload = match[1];
    if (!payload) continue;

    try {
      records.push(...flattenJsonLd(JSON.parse(payload)));
    } catch {
      // Ignore malformed third-party JSON-LD and continue with valid records.
    }
  }

  return records;
}

function asIsoDate(value: string | undefined): string | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function normaliseImage(image: string | string[] | undefined): string | null {
  const value = Array.isArray(image) ? image[0] : image;
  if (!value) return null;

  try {
    const url = new URL(value, volunteerGovBaseUrl);
    return url.protocol === "https:" && isVolunteerGovSgHost(url.hostname)
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function normaliseVenue(location: z.infer<typeof listingSchema>["location"]): string | null {
  if (!location) return null;
  if (typeof location === "string") return location.trim() || null;

  const address = location.address;
  const addressText =
    typeof address === "string"
      ? address
      : [address?.streetAddress, address?.addressLocality, address?.postalCode]
          .filter(Boolean)
          .join(", ");

  return [location.name, addressText].filter(Boolean).join(" · ") || null;
}

function normaliseSourceUrl(value: string): string | null {
  try {
    const url = new URL(value, volunteerGovBaseUrl);
    if (url.protocol !== "https:" || !isVolunteerGovSgHost(url.hostname)) return null;
    url.hash = "";
    return url.toString();
  } catch {
    return null;
  }
}

function sourceKey(sourceUrl: string): string {
  return createHash("sha256").update(sourceUrl).digest("hex");
}

export function parseVolunteerGovSgListings(
  html: string,
  importedAt = new Date(),
): ImportedOpportunity[] {
  const imported_at = importedAt.toISOString();
  const seen = new Set<string>();
  const opportunities: ImportedOpportunity[] = [];

  for (const record of readJsonLd(html)) {
    const type = record["@type"];
    const types = Array.isArray(type) ? type : [type];
    if (!types.some((value) => value === "Event" || value === "VolunteerAction")) {
      continue;
    }

    const parsed = listingSchema.safeParse(record);
    if (!parsed.success) continue;

    const source_url = normaliseSourceUrl(parsed.data.url);
    if (!source_url || seen.has(source_url)) continue;
    seen.add(source_url);

    opportunities.push({
      source_key: sourceKey(source_url),
      title: parsed.data.name,
      summary: parsed.data.description?.trim() || null,
      image_url: normaliseImage(parsed.data.image),
      starts_at: asIsoDate(parsed.data.startDate),
      ends_at: asIsoDate(parsed.data.endDate),
      venue: normaliseVenue(parsed.data.location),
      source_url,
      source_updated_at: asIsoDate(parsed.data.dateModified),
      imported_at,
      is_active: true,
      raw_payload: record,
    });
  }

  return opportunities;
}

export async function fetchMendakiVolunteerGovSgListings(
  sourceUrl: string,
): Promise<ImportedOpportunity[]> {
  const url = new URL(sourceUrl);
  if (url.protocol !== "https:" || !isVolunteerGovSgHost(url.hostname)) {
    throw new Error(
      "VOLUNTEER_GOV_SG_MENDAKI_URL must use volunteer.gov.sg over HTTPS",
    );
  }

  const response = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MENDAKI-Volunteer-Portal/1.0 (+https://www.mendaki.org.sg)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!response.ok) {
    throw new Error(`Volunteer.gov.sg returned HTTP ${response.status}`);
  }

  const listings = parseVolunteerGovSgListings(await response.text());
  if (listings.length === 0) {
    throw new Error("No structured MENDAKI opportunity records were found");
  }

  return listings;
}
