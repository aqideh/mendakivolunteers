import { createHash } from "node:crypto";

import { load } from "cheerio";
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
  schedule_text: string | null;
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

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function normaliseScheduleText(value: string): string | null {
  const schedule = normaliseWhitespace(value).replace(/[–—]/g, "-");
  if (!schedule) return null;

  if (/^12:00\s*AM\s*-\s*12:00\s*AM$/i.test(schedule)) {
    return "multiple timings";
  }

  if (/multiple\s+shifts?/i.test(schedule)) {
    return "multiple shifts";
  }

  return schedule;
}

type DateParts = Readonly<{
  year: string;
  month: string;
  day: string;
}>;

type TimeParts = Readonly<{
  hour: number;
  minute: number;
}>;

function parseDateParts(value: string): DateParts | null {
  const match = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value.trim());
  if (!match) return null;

  const [, day, month, year] = match;
  if (!day || !month || !year) return null;

  const candidate = new Date(`${year}-${month}-${day}T00:00:00+08:00`);
  if (
    Number.isNaN(candidate.getTime()) ||
    new Intl.DateTimeFormat("en-CA", {
      timeZone: "Asia/Singapore",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(candidate) !== `${year}-${month}-${day}`
  ) {
    return null;
  }

  return { year, month, day };
}

function parseDateRange(value: string): [DateParts, DateParts] | null {
  const match =
    /(\d{2}\/\d{2}\/\d{4})\s*[-–—]\s*(\d{2}\/\d{2}\/\d{4})/.exec(value);
  if (!match?.[1] || !match[2]) return null;

  const start = parseDateParts(match[1]);
  const end = parseDateParts(match[2]);
  return start && end ? [start, end] : null;
}

function toTwentyFourHour(hour: number, period: string): number {
  if (period.toUpperCase() === "AM") return hour === 12 ? 0 : hour;
  return hour === 12 ? 12 : hour + 12;
}

function parseTimeRange(value: string): [TimeParts, TimeParts] | null {
  const schedule = normaliseWhitespace(value).replace(/[–—]/g, "-");
  const match =
    /(\d{1,2}):(\d{2})\s*(AM|PM)\s*-\s*(\d{1,2}):(\d{2})\s*(AM|PM)/i.exec(
      schedule,
    );
  if (!match) return null;

  const startHour = Number(match[1]);
  const startMinute = Number(match[2]);
  const endHour = Number(match[4]);
  const endMinute = Number(match[5]);
  if (
    startHour < 1 ||
    startHour > 12 ||
    endHour < 1 ||
    endHour > 12 ||
    startMinute < 0 ||
    startMinute > 59 ||
    endMinute < 0 ||
    endMinute > 59 ||
    !match[3] ||
    !match[6]
  ) {
    return null;
  }

  return [
    {
      hour: toTwentyFourHour(startHour, match[3]),
      minute: startMinute,
    },
    {
      hour: toTwentyFourHour(endHour, match[6]),
      minute: endMinute,
    },
  ];
}

function singaporeDateTime(
  date: DateParts,
  time: TimeParts,
  seconds = "00",
): string {
  const hour = time.hour.toString().padStart(2, "0");
  const minute = time.minute.toString().padStart(2, "0");
  return new Date(
    `${date.year}-${date.month}-${date.day}T${hour}:${minute}:${seconds}+08:00`,
  ).toISOString();
}

function listingDateTimes(
  dateRange: string,
  schedule: string,
): { starts_at: string | null; ends_at: string | null } {
  const dates = parseDateRange(dateRange);
  if (!dates) return { starts_at: null, ends_at: null };

  const normalisedSchedule = normaliseScheduleText(schedule);
  const times =
    normalisedSchedule === "multiple shifts" ||
    normalisedSchedule === "multiple timings"
      ? null
      : parseTimeRange(schedule);

  return {
    starts_at: singaporeDateTime(dates[0], times?.[0] ?? { hour: 0, minute: 0 }),
    ends_at: singaporeDateTime(
      dates[1],
      times?.[1] ?? { hour: 23, minute: 59 },
      times ? "00" : "59",
    ),
  };
}

export function parseVolunteerGovSgAgencyListings(
  html: string,
  importedAt = new Date(),
): ImportedOpportunity[] {
  const $ = load(html);
  const imported_at = importedAt.toISOString();
  const seen = new Set<string>();
  const opportunities: ImportedOpportunity[] = [];

  $(".home-discover-opp").each((_, element) => {
    const card = $(element);
    const sourceHref = card
      .find('a[href*="/volunteer/opportunity/details/"]')
      .first()
      .attr("href");
    const titleElement = card.find(".label-opp-name").first();
    const title = normaliseWhitespace(
      titleElement.attr("title") ?? titleElement.text(),
    );
    const source_url = sourceHref ? normaliseSourceUrl(sourceHref) : null;
    if (!title || !source_url || seen.has(source_url)) return;

    const paragraphWithImage = (name: "calendar" | "time" | "pin") => {
      const paragraph = card
        .find(".caption p")
        .filter((__, paragraphElement) =>
          $(paragraphElement)
            .find("img")
            .toArray()
            .some((image) => ($(image).attr("src") ?? "").includes(name)),
        )
        .first();
      return paragraph.length > 0 ? paragraph : null;
    };

    const dateParagraph = paragraphWithImage("calendar");
    const timeParagraph = paragraphWithImage("time");
    const venueParagraph = paragraphWithImage("pin");
    const dateRange = normaliseWhitespace(dateParagraph?.text() ?? "");
    const rawSchedule = normaliseWhitespace(timeParagraph?.text() ?? "");
    const schedule_text = normaliseScheduleText(rawSchedule);
    const venue = normaliseWhitespace(
      venueParagraph?.attr("title") ?? venueParagraph?.text() ?? "",
    );
    const image = card
      .find('a[href*="/volunteer/opportunity/details/"] img.img-fluid')
      .first()
      .attr("src");
    const availability = normaliseWhitespace(
      card.find(".opp-thumb-slot-label").first().text(),
    );
    const { starts_at, ends_at } = listingDateTimes(dateRange, rawSchedule);

    seen.add(source_url);
    opportunities.push({
      source_key: sourceKey(source_url),
      title,
      summary: null,
      image_url: normaliseImage(image),
      starts_at,
      ends_at,
      schedule_text,
      venue: venue || null,
      source_url,
      source_updated_at: null,
      imported_at,
      is_active: true,
      raw_payload: {
        source_format: "volunteer.gov.sg agency listing",
        date_range: dateRange,
        schedule: rawSchedule,
        availability,
      },
    });
  });

  return opportunities;
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
      summary: null,
      image_url: normaliseImage(parsed.data.image),
      starts_at: asIsoDate(parsed.data.startDate),
      ends_at: asIsoDate(parsed.data.endDate),
      schedule_text: null,
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

function readAgencyPageContext(html: string) {
  const $ = load(html);
  const agencyId = $("#hdAgencyId").attr("value");
  const requestVerificationToken = $(
    'input[name="__RequestVerificationToken"]',
  ).attr("value");
  const pageNumber = $("#hiddenAgencyDetailOpPageNo").attr("value") ?? "3";

  if (!agencyId || !requestVerificationToken) {
    throw new Error("MENDAKI agency page context could not be read");
  }

  return { agencyId, requestVerificationToken, pageNumber };
}

function responseCookieHeader(headers: Headers): string | null {
  const cookieAwareHeaders = headers as Headers & {
    getSetCookie?: () => string[];
  };
  const cookieHeaders =
    typeof cookieAwareHeaders.getSetCookie === "function"
      ? cookieAwareHeaders.getSetCookie()
      : [headers.get("set-cookie")].filter(
          (value): value is string => value !== null,
        );
  const cookies = cookieHeaders
    .map((value) => value.split(";", 1)[0]?.trim())
    .filter((value): value is string => Boolean(value));
  return cookies.length > 0 ? cookies.join("; ") : null;
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

  const pageResponse = await fetch(url, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent": "MENDAKI-Volunteer-Portal/1.0 (+https://www.mendaki.org.sg)",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(15_000),
  });

  if (!pageResponse.ok) {
    throw new Error(`Volunteer.gov.sg returned HTTP ${pageResponse.status}`);
  }

  const agencyPage = await pageResponse.text();
  const structuredListings = parseVolunteerGovSgListings(agencyPage);
  if (structuredListings.length > 0) return structuredListings;

  const { agencyId, requestVerificationToken, pageNumber } =
    readAgencyPageContext(agencyPage);
  const cookie = responseCookieHeader(pageResponse.headers);
  const requestHeaders: Record<string, string> = {
    accept: "text/html,application/xhtml+xml",
    "content-type": "application/x-www-form-urlencoded; charset=UTF-8",
    origin: url.origin,
    referer: url.toString(),
    "user-agent": "MENDAKI-Volunteer-Portal/1.0 (+https://www.mendaki.org.sg)",
  };
  if (cookie) requestHeaders.cookie = cookie;

  const listingResponse = await fetch(
    new URL("/Agency/GetOpportunityByAgency/", url),
    {
      method: "POST",
      headers: requestHeaders,
      body: new URLSearchParams({
        agencyID: agencyId,
        loadFor: "UpComing",
        PageNo: pageNumber,
        loadMore: "True",
        __RequestVerificationToken: requestVerificationToken,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    },
  );

  if (!listingResponse.ok) {
    throw new Error(
      `Volunteer.gov.sg opportunity listing returned HTTP ${listingResponse.status}`,
    );
  }

  const listings = parseVolunteerGovSgAgencyListings(
    await listingResponse.text(),
  );
  if (listings.length === 0) {
    throw new Error("No MENDAKI opportunity records were found");
  }

  return listings;
}
