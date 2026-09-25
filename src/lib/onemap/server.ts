import "server-only";

import { z } from "zod";

const tokenResponseSchema = z.object({
  access_token: z.string().min(1),
  expiry_timestamp: z.union([z.string(), z.number()]),
});

const searchResultSchema = z.object({
  ADDRESS: z.string().min(1),
  POSTAL: z.string().min(1),
  LATITUDE: z.string().min(1),
  LONGITUDE: z.string().min(1),
});

const searchResponseSchema = z.object({
  error: z.string().optional(),
  found: z.number().optional(),
  results: z.array(searchResultSchema).default([]),
});

const planningAreaSchema = z.object({
  pln_area_n: z.string().min(1),
});

let cachedToken: { value: string; expiresAtMs: number } | null = null;

function oneMapBaseUrl() {
  return process.env.ONEMAP_BASE_URL?.trim() || "https://www.onemap.gov.sg";
}

async function getOneMapToken() {
  if (cachedToken && cachedToken.expiresAtMs - Date.now() > 5 * 60 * 1000) {
    return cachedToken.value;
  }

  const email = z.string().email().parse(process.env.ONEMAP_API_EMAIL);
  const password = z.string().min(1).parse(process.env.ONEMAP_API_PASSWORD);

  const response = await fetch(`${oneMapBaseUrl()}/api/auth/post/getToken`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OneMap authentication failed with status ${response.status}`);
  }

  const parsed = tokenResponseSchema.safeParse(await response.json());
  if (!parsed.success) {
    throw new Error("OneMap authentication returned an invalid response");
  }

  const expirySeconds = Number(parsed.data.expiry_timestamp);
  cachedToken = {
    value: parsed.data.access_token,
    expiresAtMs: Number.isFinite(expirySeconds)
      ? expirySeconds * 1000
      : Date.now() + 60 * 60 * 1000,
  };

  return cachedToken.value;
}

async function oneMapGet(path: string) {
  const token = await getOneMapToken();
  const response = await fetch(`${oneMapBaseUrl()}${path}`, {
    headers: {
      Authorization: token,
    },
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`OneMap request failed with status ${response.status}`);
  }

  return response.json();
}

export type VerifiedSingaporeLocation = Readonly<{
  postalCode: string;
  normalizedAddress: string;
  latitude: number;
  longitude: number;
  planningArea: string | null;
}>;

export async function resolveSingaporePostalCode(
  postalCode: string,
): Promise<VerifiedSingaporeLocation> {
  const cleanPostalCode = z.string().regex(/^[0-9]{6}$/).parse(postalCode);

  const searchPayload = await oneMapGet(
    `/api/common/elastic/search?searchVal=${encodeURIComponent(cleanPostalCode)}&returnGeom=Y&getAddrDetails=Y&pageNum=1`,
  );
  const searchParsed = searchResponseSchema.safeParse(searchPayload);

  if (!searchParsed.success || searchParsed.data.error) {
    throw new Error("OneMap address search could not verify this postal code");
  }

  const exact =
    searchParsed.data.results.find((item) => item.POSTAL === cleanPostalCode) ??
    null;

  if (!exact) {
    throw new Error("OneMap did not return an exact match for this postal code");
  }

  const latitude = Number(exact.LATITUDE);
  const longitude = Number(exact.LONGITUDE);

  if (
    !Number.isFinite(latitude) ||
    !Number.isFinite(longitude) ||
    latitude < 1.1 ||
    latitude > 1.6 ||
    longitude < 103.5 ||
    longitude > 104.2
  ) {
    throw new Error("OneMap returned invalid Singapore coordinates");
  }

  let planningArea: string | null = null;
  const planningPayload = await oneMapGet(
    `/api/public/popapi/getPlanningarea?latitude=${encodeURIComponent(String(latitude))}&longitude=${encodeURIComponent(String(longitude))}&year=2019`,
  );
  const planningParsed = z.array(planningAreaSchema).safeParse(planningPayload);
  if (planningParsed.success && planningParsed.data.length > 0) {
    planningArea = planningParsed.data[0].pln_area_n.trim() || null;
  }

  return {
    postalCode: cleanPostalCode,
    normalizedAddress: exact.ADDRESS.trim(),
    latitude,
    longitude,
    planningArea,
  };
}
