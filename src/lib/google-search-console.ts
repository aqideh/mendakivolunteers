import "server-only";

import { createSign } from "node:crypto";

import { EDITABLE_SEO_PAGES, SITE_URL } from "@/lib/seo";

type SearchAnalyticsRow = {
  keys?: string[];
  clicks?: number;
  impressions?: number;
  ctr?: number;
  position?: number;
};

type SearchAnalyticsResponse = { rows?: SearchAnalyticsRow[] };
type SitemapEntry = {
  path: string;
  lastSubmitted?: string;
  lastDownloaded?: string;
  isPending?: boolean;
  warnings?: string;
  errors?: string;
};
type SitemapResponse = { sitemap?: SitemapEntry[] };

export type SearchConsoleReport = Readonly<{
  dates: { from: string; through: string };
  totals: { clicks: number; impressions: number; ctr: number; position: number };
  queries: Array<{ keyword: string; clicks: number; impressions: number; position: number }>;
  pages: Array<{ url: string; clicks: number; impressions: number; position: number }>;
  sitemap: SitemapEntry | null;
}>;

type Configuration = { clientEmail: string; privateKey: string; siteUrl: string };

export function isSearchConsoleConfigured(): boolean {
  return Boolean(
    process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL &&
    process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY &&
    process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL,
  );
}

function configuration(): Configuration {
  const clientEmail = process.env.GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL?.trim();
  const privateKey = process.env.GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY?.replace(/\\n/g, "\n");
  const siteUrl = process.env.GOOGLE_SEARCH_CONSOLE_SITE_URL?.trim();

  // A dedicated URL-prefix property keeps the report restricted to Keluarga.
  if (!clientEmail || !privateKey || siteUrl !== SITE_URL + "/") {
    throw new Error("Configure the Search Console service account and the exact Keluarga URL-prefix property.");
  }
  return { clientEmail, privateKey, siteUrl };
}

function base64url(value: string): string {
  return Buffer.from(value).toString("base64url");
}

async function googleToken(config: Configuration): Promise<string> {
  const issuedAt = Math.floor(Date.now() / 1000);
  const payload = {
    iss: config.clientEmail,
    scope: "https://www.googleapis.com/auth/webmasters.readonly",
    aud: "https://oauth2.googleapis.com/token",
    iat: issuedAt,
    exp: issuedAt + 3600,
  };
  const unsigned = [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(JSON.stringify(payload)),
  ].join(".");
  const signature = createSign("RSA-SHA256").update(unsigned).end().sign(config.privateKey, "base64url");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: unsigned + "." + signature,
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) throw new Error("Google authentication failed. Check the service-account key and Search Console API access.");
  const body = await response.json() as { access_token?: string };
  if (!body.access_token) throw new Error("Google did not return a Search Console access token.");
  return body.access_token;
}

async function googleJson<T>(url: string, token: string, body?: unknown): Promise<T> {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: {
      authorization: "Bearer " + token,
      ...(body === undefined ? {} : { "content-type": "application/json" }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });

  if (!response.ok) {
    const message = response.status === 403
      ? "Google denied access. Grant the service account access to the Keluarga Search Console property and enable the API."
      : "Google Search Console request failed (HTTP " + response.status + ").";
    throw new Error(message);
  }
  return response.json() as Promise<T>;
}

function dateKey(date: Date) {
  return date.toISOString().slice(0, 10);
}

export async function getSearchConsoleReport(): Promise<SearchConsoleReport> {
  const config = configuration();
  const token = await googleToken(config);
  const throughDate = new Date(Date.now() - 3 * 86_400_000);
  const fromDate = new Date(throughDate.getTime() - 27 * 86_400_000);
  const dates = { from: dateKey(fromDate), through: dateKey(throughDate) };
  const base = "https://www.googleapis.com/webmasters/v3/sites/" + encodeURIComponent(config.siteUrl);
  const query = (dimensions: string[], rowLimit: number) => googleJson<SearchAnalyticsResponse>(
    base + "/searchAnalytics/query", token,
    { startDate: dates.from, endDate: dates.through, dimensions, rowLimit, dataState: "final" },
  );

  const [overview, queries, pages, sitemaps] = await Promise.all([
    query([], 1),
    query(["query"], 20),
    query(["page"], 20),
    googleJson<SitemapResponse>(base + "/sitemaps", token),
  ]);

  const totals = overview.rows?.[0];
  const sitemap = (sitemaps.sitemap ?? []).find((item) => item.path === SITE_URL + "/sitemap.xml") ?? null;
  return {
    dates,
    totals: {
      clicks: totals?.clicks ?? 0,
      impressions: totals?.impressions ?? 0,
      ctr: totals?.ctr ?? 0,
      position: totals?.position ?? 0,
    },
    queries: (queries.rows ?? []).map((row) => ({
      keyword: row.keys?.[0] ?? "",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      position: row.position ?? 0,
    })),
    pages: (pages.rows ?? []).map((row) => ({
      url: row.keys?.[0] ?? "",
      clicks: row.clicks ?? 0,
      impressions: row.impressions ?? 0,
      position: row.position ?? 0,
    })),
    sitemap,
  };
}

export type GoogleIndexResult = Readonly<{
  url: string;
  verdict: string;
  coverage: string;
  robots: string;
  indexing: string;
  lastCrawl: string | null;
  googleCanonical: string | null;
}>;

export async function inspectGoogleIndex(path: string): Promise<GoogleIndexResult> {
  if (!EDITABLE_SEO_PAGES.some((page) => page.path === path)) {
    throw new Error("Only listed public pages can be inspected.");
  }
  const config = configuration();
  const token = await googleToken(config);
  const url = new URL(path, SITE_URL).toString();
  const result = await googleJson<{
    inspectionResult?: {
      indexStatusResult?: {
        verdict?: string;
        coverageState?: string;
        robotsTxtState?: string;
        indexingState?: string;
        lastCrawlTime?: string;
        googleCanonical?: string;
      };
    };
  }>("https://searchconsole.googleapis.com/v1/urlInspection/index:inspect", token, {
    inspectionUrl: url,
    siteUrl: config.siteUrl,
  });
  const status = result.inspectionResult?.indexStatusResult;
  return {
    url,
    verdict: status?.verdict ?? "UNKNOWN",
    coverage: status?.coverageState ?? "Not available",
    robots: status?.robotsTxtState ?? "Unknown",
    indexing: status?.indexingState ?? "Unknown",
    lastCrawl: status?.lastCrawlTime ?? null,
    googleCanonical: status?.googleCanonical ?? null,
  };
}

export async function checkLiveSitemap(): Promise<{ ok: boolean; count: number; status: number }> {
  const response = await fetch(SITE_URL + "/sitemap.xml", {
    cache: "no-store",
    signal: AbortSignal.timeout(12000),
  });
  const text = response.ok ? await response.text() : "";
  return {
    ok: response.ok && text.includes("<urlset"),
    count: [...text.matchAll(/<loc>/g)].length,
    status: response.status,
  };
}
