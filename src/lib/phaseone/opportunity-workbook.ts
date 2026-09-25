import "server-only";

import { inflateRawSync } from "node:zlib";

import { singaporeDateTimeLocalToIso } from "@/lib/content/dates";
import { eventFormSchema } from "@/lib/phaseone/event-validation";

const opportunityHeaders = [
  "Opportunity Key*",
  "Title*",
  "Slug*",
  "Short Summary",
  "Full Description",
  "Category",
  "Eligibility / Requirements",
  "Card Image URL (HTTPS)",
  "Registration Deadline (SGT)",
  "Venue",
  "Address / Directions",
  "Display Order",
  "Publish on Opportunities Page?*",
  "Internal Notes (not imported)",
] as const;

const shiftHeaders = [
  "Opportunity Key*",
  "Shift Label",
  "Start Date/Time (SGT)*",
  "End Date/Time (SGT)",
  "Registration Capacity",
  "Status*",
  "Display Order",
  "Internal Notes (not imported)",
] as const;

const defaultAttireNotes = "Wear your MENDAKI volunteer shirt if you have one.";
export const opportunityWorkbookMaxBytes = 8 * 1024 * 1024;

export type OpportunityWorkbookIssue = Readonly<{
  severity: "error" | "warning";
  code: string;
  sheet: "Workbook" | "Opportunities" | "Shifts";
  row: number | null;
  message: string;
}>;

export type OpportunityWorkbookTimeslot = Readonly<{
  sourceRow: number;
  label: string | null;
  startsAt: string;
  endsAt: string | null;
  registrationCapacity: number | null;
  status: "scheduled" | "cancelled";
  sortOrder: number;
}>;

export type OpportunityWorkbookEvent = Readonly<{
  sourceRow: number;
  opportunityKey: string;
  title: string;
  slug: string;
  opportunitySummary: string | null;
  opportunityDescription: string | null;
  opportunityImageUrl: string | null;
  opportunityCategory: string | null;
  opportunityEligibility: string | null;
  registrationDeadline: string | null;
  venue: string | null;
  navigationDestination: string | null;
  opportunitySortOrder: number | null;
  requestedOpportunityPublish: boolean;
  timeslots: OpportunityWorkbookTimeslot[];
}>;

export type OpportunityWorkbookParseResult = Readonly<{
  valid: boolean;
  events: OpportunityWorkbookEvent[];
  issues: OpportunityWorkbookIssue[];
  opportunityRows: number;
  shiftRows: number;
}>;

type CellValue = string | number | boolean | null;
type SheetRows = Map<number, Map<number, CellValue>>;

function decodeXml(value: string): string {
  return value
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(Number.parseInt(code, 16)));
}

function findEndOfCentralDirectory(bytes: Uint8Array): number {
  const minimum = Math.max(0, bytes.length - 65_557);
  for (let index = bytes.length - 22; index >= minimum; index -= 1) {
    if (
      bytes[index] === 0x50 &&
      bytes[index + 1] === 0x4b &&
      bytes[index + 2] === 0x05 &&
      bytes[index + 3] === 0x06
    ) {
      return index;
    }
  }
  throw new Error("The file is not a readable XLSX workbook.");
}

function readZipEntries(buffer: ArrayBuffer): Map<string, Uint8Array> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const eocd = findEndOfCentralDirectory(bytes);
  const totalEntries = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Uint8Array>();

  for (let entryIndex = 0; entryIndex < totalEntries; entryIndex += 1) {
    if (view.getUint32(offset, true) !== 0x02014b50) {
      throw new Error("The XLSX archive directory is invalid.");
    }

    const compression = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const fileNameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    const localOffset = view.getUint32(offset + 42, true);
    const fileName = decoder.decode(bytes.slice(offset + 46, offset + 46 + fileNameLength));

    if (view.getUint32(localOffset, true) !== 0x04034b50) {
      throw new Error("The XLSX archive contains an invalid file entry.");
    }
    const localNameLength = view.getUint16(localOffset + 26, true);
    const localExtraLength = view.getUint16(localOffset + 28, true);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = bytes.slice(dataStart, dataStart + compressedSize);

    let data: Uint8Array;
    if (compression === 0) {
      data = compressed;
    } else if (compression === 8) {
      data = new Uint8Array(inflateRawSync(compressed));
    } else {
      throw new Error("The XLSX workbook uses an unsupported compression method.");
    }
    entries.set(fileName.replace(/^\/+/, ""), data);
    offset += 46 + fileNameLength + extraLength + commentLength;
  }

  return entries;
}

function entryText(entries: Map<string, Uint8Array>, path: string): string {
  const value = entries.get(path);
  if (!value) throw new Error(`The workbook is missing ${path}.`);
  return new TextDecoder().decode(value);
}

function parseSharedStrings(xml: string | null): string[] {
  if (!xml) return [];
  const values: string[] = [];
  const itemPattern = /<si\b[^>]*>([\s\S]*?)<\/si>/g;
  let item: RegExpExecArray | null;
  while ((item = itemPattern.exec(xml))) {
    const pieces: string[] = [];
    const textPattern = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g;
    let text: RegExpExecArray | null;
    while ((text = textPattern.exec(item[1] ?? ""))) {
      pieces.push(decodeXml(text[1] ?? ""));
    }
    values.push(pieces.join(""));
  }
  return values;
}

function columnNumber(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "";
  let value = 0;
  for (const character of letters) value = value * 26 + character.charCodeAt(0) - 64;
  return value;
}

function parseSheet(xml: string, sharedStrings: readonly string[]): SheetRows {
  const rows: SheetRows = new Map();
  const cellPattern = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
  let cell: RegExpExecArray | null;

  while ((cell = cellPattern.exec(xml))) {
    const attrs = cell[1] ?? "";
    const body = cell[2] ?? "";
    const reference = /\br="([A-Z]+\d+)"/.exec(attrs)?.[1];
    if (!reference) continue;
    const rowNumber = Number(/\d+$/.exec(reference)?.[0] ?? "0");
    const colNumber = columnNumber(reference);
    if (!rowNumber || !colNumber) continue;

    const type = /\bt="([^"]+)"/.exec(attrs)?.[1] ?? "";
    const rawValue = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1] ?? "";
    let value: CellValue = null;

    if (type === "s") {
      const index = Number(rawValue);
      value = Number.isInteger(index) ? sharedStrings[index] ?? "" : "";
    } else if (type === "inlineStr") {
      const text = /<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/.exec(body)?.[1] ?? "";
      value = decodeXml(text);
    } else if (type === "str") {
      value = decodeXml(rawValue);
    } else if (type === "b") {
      value = rawValue === "1";
    } else if (rawValue !== "") {
      const numeric = Number(rawValue);
      value = Number.isFinite(numeric) ? numeric : decodeXml(rawValue);
    }

    const row = rows.get(rowNumber) ?? new Map<number, CellValue>();
    row.set(colNumber, value);
    rows.set(rowNumber, row);
  }

  return rows;
}

function parseWorkbookSheets(entries: Map<string, Uint8Array>): Map<string, SheetRows> {
  const workbookXml = entryText(entries, "xl/workbook.xml");
  const relationshipsXml = entryText(entries, "xl/_rels/workbook.xml.rels");
  const sharedStrings = entries.has("xl/sharedStrings.xml")
    ? parseSharedStrings(entryText(entries, "xl/sharedStrings.xml"))
    : [];

  const relationTargets = new Map<string, string>();
  const relationPattern = /<Relationship\b([^>]+)\/>/g;
  let relation: RegExpExecArray | null;
  while ((relation = relationPattern.exec(relationshipsXml))) {
    const attrs = relation[1] ?? "";
    const id = /\bId="([^"]+)"/.exec(attrs)?.[1];
    const target = /\bTarget="([^"]+)"/.exec(attrs)?.[1];
    if (id && target) relationTargets.set(id, target.replace(/^\/+/, ""));
  }

  const sheets = new Map<string, SheetRows>();
  const sheetPattern = /<sheet\b([^>]+)\/>/g;
  let sheet: RegExpExecArray | null;
  while ((sheet = sheetPattern.exec(workbookXml))) {
    const attrs = sheet[1] ?? "";
    const name = decodeXml(/\bname="([^"]+)"/.exec(attrs)?.[1] ?? "");
    const relationId = /\br:id="([^"]+)"/.exec(attrs)?.[1];
    const target = relationId ? relationTargets.get(relationId) : null;
    if (!name || !target) continue;
    const path = target.startsWith("xl/") ? target : `xl/${target}`;
    if (entries.has(path)) sheets.set(name, parseSheet(entryText(entries, path), sharedStrings));
  }
  return sheets;
}

function textValue(value: CellValue): string {
  if (value === null || value === undefined) return "";
  return String(value).trim();
}

function nullableText(value: CellValue): string | null {
  const text = textValue(value);
  return text || null;
}

function integerValue(value: CellValue): number | null {
  if (value === null || value === "") return null;
  const number = typeof value === "number" ? value : Number(textValue(value));
  return Number.isInteger(number) ? number : null;
}

function excelLocalDateTime(value: CellValue): string | null {
  if (value === null || value === "") return null;

  if (typeof value === "number" && Number.isFinite(value)) {
    const milliseconds = Date.UTC(1899, 11, 30) + Math.round(value * 86_400_000);
    const date = new Date(milliseconds);
    const local = [
      String(date.getUTCFullYear()).padStart(4, "0"),
      "-",
      String(date.getUTCMonth() + 1).padStart(2, "0"),
      "-",
      String(date.getUTCDate()).padStart(2, "0"),
      "T",
      String(date.getUTCHours()).padStart(2, "0"),
      ":",
      String(date.getUTCMinutes()).padStart(2, "0"),
    ].join("");
    return singaporeDateTimeLocalToIso(local);
  }

  const text = textValue(value);
  const localMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(text);
  if (localMatch) {
    const [, year, month, day, hour, minute, second] = localMatch;
    const local = `${year}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}T${hour!.padStart(2, "0")}:${minute}${second ? `:${second}` : ""}`;
    try {
      return singaporeDateTimeLocalToIso(local);
    } catch {
      return null;
    }
  }

  if (/Z$|[+-]\d{2}:?\d{2}$/.test(text)) {
    const parsed = new Date(text);
    return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
  }

  return null;
}

function yesNo(value: CellValue): boolean | null {
  const normalized = textValue(value).toLowerCase();
  if (normalized === "yes") return true;
  if (normalized === "no") return false;
  return null;
}

function rowHasInput(row: Map<number, CellValue> | undefined, maxColumn: number): boolean {
  if (!row) return false;
  for (let column = 1; column <= maxColumn; column += 1) {
    const value = row.get(column);
    if (value !== null && value !== undefined && textValue(value) !== "") return true;
  }
  return false;
}

function validateHeaders(
  rows: SheetRows,
  expected: readonly string[],
  sheet: "Opportunities" | "Shifts",
  issues: OpportunityWorkbookIssue[],
) {
  const headerRow = rows.get(5);
  expected.forEach((header, index) => {
    const actual = textValue(headerRow?.get(index + 1) ?? null);
    if (actual !== header) {
      issues.push({
        severity: "error",
        code: "TEMPLATE_HEADER_MISMATCH",
        sheet,
        row: 5,
        message: `Expected column ${index + 1} to be “${header}”. Use the Keluarga opportunity population template without renaming columns.`,
      });
    }
  });
}

function addIssue(
  issues: OpportunityWorkbookIssue[],
  issue: OpportunityWorkbookIssue,
) {
  issues.push(issue);
}

export function parseOpportunityWorkbook(buffer: ArrayBuffer): OpportunityWorkbookParseResult {
  const issues: OpportunityWorkbookIssue[] = [];
  let sheets: Map<string, SheetRows>;

  try {
    const entries = readZipEntries(buffer);
    sheets = parseWorkbookSheets(entries);
  } catch (error) {
    return {
      valid: false,
      events: [],
      issues: [{
        severity: "error",
        code: "WORKBOOK_UNREADABLE",
        sheet: "Workbook",
        row: null,
        message: error instanceof Error ? error.message : "The XLSX workbook could not be read.",
      }],
      opportunityRows: 0,
      shiftRows: 0,
    };
  }

  const opportunitySheet = sheets.get("Opportunities");
  const shiftSheet = sheets.get("Shifts");
  if (!opportunitySheet || !shiftSheet) {
    return {
      valid: false,
      events: [],
      issues: [{
        severity: "error",
        code: "TEMPLATE_SHEETS_MISSING",
        sheet: "Workbook",
        row: null,
        message: "The workbook must contain sheets named Opportunities and Shifts.",
      }],
      opportunityRows: 0,
      shiftRows: 0,
    };
  }

  validateHeaders(opportunitySheet, opportunityHeaders, "Opportunities", issues);
  validateHeaders(shiftSheet, shiftHeaders, "Shifts", issues);

  const opportunityKeys = new Map<string, { row: number; slug: string }>();
  const slugRows = new Map<string, number>();
  const draftEvents: Array<Omit<OpportunityWorkbookEvent, "timeslots">> = [];

  for (let rowNumber = 6; rowNumber <= 206; rowNumber += 1) {
    const row = opportunitySheet.get(rowNumber);
    if (!rowHasInput(row, 14)) continue;

    const opportunityKey = textValue(row?.get(1) ?? null);
    const title = textValue(row?.get(2) ?? null);
    const slug = textValue(row?.get(3) ?? null);
    const opportunitySummary = nullableText(row?.get(4) ?? null);
    const opportunityDescription = nullableText(row?.get(5) ?? null);
    const opportunityCategory = nullableText(row?.get(6) ?? null);
    const opportunityEligibility = nullableText(row?.get(7) ?? null);
    const opportunityImageUrl = nullableText(row?.get(8) ?? null);
    const registrationRaw = row?.get(9) ?? null;
    const registrationDeadline = registrationRaw === null || textValue(registrationRaw) === ""
      ? null
      : excelLocalDateTime(registrationRaw);
    const venue = nullableText(row?.get(10) ?? null);
    const navigationDestination = nullableText(row?.get(11) ?? null);
    const sortRaw = row?.get(12) ?? null;
    const opportunitySortOrder = sortRaw === null || textValue(sortRaw) === "" ? null : integerValue(sortRaw);
    const requestedPublish = yesNo(row?.get(13) ?? null);

    if (!opportunityKey) addIssue(issues, { severity: "error", code: "MISSING_OPPORTUNITY_KEY", sheet: "Opportunities", row: rowNumber, message: "Opportunity Key is required." });
    else if (opportunityKeys.has(opportunityKey)) addIssue(issues, { severity: "error", code: "DUPLICATE_OPPORTUNITY_KEY", sheet: "Opportunities", row: rowNumber, message: `Opportunity Key “${opportunityKey}” is duplicated.` });

    if (!title) addIssue(issues, { severity: "error", code: "MISSING_TITLE", sheet: "Opportunities", row: rowNumber, message: "Title is required." });
    else if (title.length < 3 || title.length > 160) addIssue(issues, { severity: "error", code: "INVALID_TITLE_LENGTH", sheet: "Opportunities", row: rowNumber, message: "Title must be 3 to 160 characters." });

    if (!slug) addIssue(issues, { severity: "error", code: "MISSING_SLUG", sheet: "Opportunities", row: rowNumber, message: "Slug is required." });
    else if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) addIssue(issues, { severity: "error", code: "INVALID_SLUG", sheet: "Opportunities", row: rowNumber, message: "Slug must contain lowercase letters/numbers separated by single hyphens." });
    else if (slugRows.has(slug)) addIssue(issues, { severity: "error", code: "DUPLICATE_SLUG", sheet: "Opportunities", row: rowNumber, message: `Slug “${slug}” is duplicated in the workbook.` });

    if (opportunitySummary && opportunitySummary.length > 500) addIssue(issues, { severity: "error", code: "SUMMARY_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Short Summary must be 500 characters or fewer." });
    if (opportunityDescription && opportunityDescription.length > 6000) addIssue(issues, { severity: "error", code: "DESCRIPTION_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Full Description must be 6,000 characters or fewer." });
    if (opportunityCategory && opportunityCategory.length > 120) addIssue(issues, { severity: "error", code: "CATEGORY_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Category must be 120 characters or fewer." });
    if (opportunityEligibility && opportunityEligibility.length > 2000) addIssue(issues, { severity: "error", code: "ELIGIBILITY_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Eligibility / Requirements must be 2,000 characters or fewer." });
    if (opportunityImageUrl) {
      try {
        const imageUrl = new URL(opportunityImageUrl);
        if (imageUrl.protocol !== "https:") throw new Error();
      } catch {
        addIssue(issues, { severity: "error", code: "INVALID_IMAGE_URL", sheet: "Opportunities", row: rowNumber, message: "Card Image URL must be a valid HTTPS URL." });
      }
    }
    if (registrationRaw !== null && textValue(registrationRaw) !== "" && !registrationDeadline) addIssue(issues, { severity: "error", code: "INVALID_REGISTRATION_DEADLINE", sheet: "Opportunities", row: rowNumber, message: "Registration Deadline must be a valid Singapore date/time." });
    if (venue && venue.length > 240) addIssue(issues, { severity: "error", code: "VENUE_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Venue must be 240 characters or fewer." });
    if (navigationDestination && navigationDestination.length > 500) addIssue(issues, { severity: "error", code: "ADDRESS_TOO_LONG", sheet: "Opportunities", row: rowNumber, message: "Address / Directions must be 500 characters or fewer." });
    if (sortRaw !== null && textValue(sortRaw) !== "" && (opportunitySortOrder === null || opportunitySortOrder < 0 || opportunitySortOrder > 9999)) addIssue(issues, { severity: "error", code: "INVALID_DISPLAY_ORDER", sheet: "Opportunities", row: rowNumber, message: "Display Order must be a whole number from 0 to 9,999." });
    if (requestedPublish === null) addIssue(issues, { severity: "error", code: "INVALID_PUBLISH_FLAG", sheet: "Opportunities", row: rowNumber, message: "Publish on Opportunities Page? must be Yes or No." });
    if (requestedPublish === true && !opportunitySummary) addIssue(issues, { severity: "error", code: "PUBLISHED_SUMMARY_REQUIRED", sheet: "Opportunities", row: rowNumber, message: "A listing marked Yes needs a Short Summary." });

    if (opportunityKey && !opportunityKeys.has(opportunityKey)) opportunityKeys.set(opportunityKey, { row: rowNumber, slug });
    if (slug && !slugRows.has(slug)) slugRows.set(slug, rowNumber);

    draftEvents.push({
      sourceRow: rowNumber,
      opportunityKey,
      title,
      slug,
      opportunitySummary,
      opportunityDescription,
      opportunityImageUrl,
      opportunityCategory,
      opportunityEligibility,
      registrationDeadline,
      venue,
      navigationDestination,
      opportunitySortOrder,
      requestedOpportunityPublish: requestedPublish === true,
    });
  }

  const shiftsByKey = new Map<string, OpportunityWorkbookTimeslot[]>();
  let shiftRows = 0;

  for (let rowNumber = 6; rowNumber <= 505; rowNumber += 1) {
    const row = shiftSheet.get(rowNumber);
    if (!rowHasInput(row, 8)) continue;
    shiftRows += 1;

    const opportunityKey = textValue(row?.get(1) ?? null);
    const label = nullableText(row?.get(2) ?? null);
    const startRaw = row?.get(3) ?? null;
    const endRaw = row?.get(4) ?? null;
    const startsAt = excelLocalDateTime(startRaw);
    const endsAt = endRaw === null || textValue(endRaw) === "" ? null : excelLocalDateTime(endRaw);
    const capacityRaw = row?.get(5) ?? null;
    const capacity = capacityRaw === null || textValue(capacityRaw) === "" ? null : integerValue(capacityRaw);
    const statusText = textValue(row?.get(6) ?? null).toLowerCase();
    const status = statusText === "scheduled" ? "scheduled" : statusText === "cancelled" ? "cancelled" : null;
    const sortRaw = row?.get(7) ?? null;
    const sortOrder = sortRaw === null || textValue(sortRaw) === "" ? rowNumber - 6 : integerValue(sortRaw);

    if (!opportunityKey) addIssue(issues, { severity: "error", code: "MISSING_SHIFT_OPPORTUNITY_KEY", sheet: "Shifts", row: rowNumber, message: "Opportunity Key is required for every shift." });
    else if (!opportunityKeys.has(opportunityKey)) addIssue(issues, { severity: "error", code: "UNKNOWN_OPPORTUNITY_KEY", sheet: "Shifts", row: rowNumber, message: `Opportunity Key “${opportunityKey}” does not exist on the Opportunities sheet.` });
    if (label && label.length > 120) addIssue(issues, { severity: "error", code: "SHIFT_LABEL_TOO_LONG", sheet: "Shifts", row: rowNumber, message: "Shift Label must be 120 characters or fewer." });
    if (!startsAt) addIssue(issues, { severity: "error", code: "INVALID_SHIFT_START", sheet: "Shifts", row: rowNumber, message: "Start Date/Time is required and must be a valid Singapore date/time." });
    if (endRaw !== null && textValue(endRaw) !== "" && !endsAt) addIssue(issues, { severity: "error", code: "INVALID_SHIFT_END", sheet: "Shifts", row: rowNumber, message: "End Date/Time must be a valid Singapore date/time." });
    if (startsAt && endsAt && endsAt <= startsAt) addIssue(issues, { severity: "error", code: "SHIFT_END_BEFORE_START", sheet: "Shifts", row: rowNumber, message: "Shift end must be after shift start." });
    if (capacityRaw !== null && textValue(capacityRaw) !== "" && (capacity === null || capacity < 1 || capacity > 10000)) addIssue(issues, { severity: "error", code: "INVALID_SHIFT_CAPACITY", sheet: "Shifts", row: rowNumber, message: "Registration Capacity must be a whole number from 1 to 10,000." });
    if (!status) addIssue(issues, { severity: "error", code: "INVALID_SHIFT_STATUS", sheet: "Shifts", row: rowNumber, message: "Status must be Scheduled or Cancelled." });
    if (sortOrder === null || sortOrder < 0 || sortOrder > 9999) addIssue(issues, { severity: "error", code: "INVALID_SHIFT_DISPLAY_ORDER", sheet: "Shifts", row: rowNumber, message: "Shift Display Order must be a whole number from 0 to 9,999." });

    if (opportunityKey && startsAt && status && sortOrder !== null && sortOrder >= 0 && sortOrder <= 9999) {
      const shifts = shiftsByKey.get(opportunityKey) ?? [];
      shifts.push({
        sourceRow: rowNumber,
        label,
        startsAt,
        endsAt,
        registrationCapacity: capacity,
        status,
        sortOrder,
      });
      shiftsByKey.set(opportunityKey, shifts);
    }
  }

  const events: OpportunityWorkbookEvent[] = draftEvents.map((event) => {
    const timeslots = [...(shiftsByKey.get(event.opportunityKey) ?? [])].sort(
      (left, right) => left.sortOrder - right.sortOrder || left.sourceRow - right.sourceRow,
    );

    if (timeslots.length === 0) {
      addIssue(issues, { severity: "error", code: "MISSING_SHIFT", sheet: "Opportunities", row: event.sourceRow, message: `“${event.title || event.opportunityKey}” needs at least one shift.` });
    }
    if (event.requestedOpportunityPublish && !timeslots.some((timeslot) => timeslot.status === "scheduled")) {
      addIssue(issues, { severity: "error", code: "PUBLISHED_SHIFT_REQUIRED", sheet: "Opportunities", row: event.sourceRow, message: `“${event.title || event.opportunityKey}” is marked for publication and needs at least one Scheduled shift.` });
    }

    const seenTimeslots = new Set<string>();
    for (const timeslot of timeslots) {
      const key = `${timeslot.startsAt}|${timeslot.endsAt ?? ""}`;
      if (seenTimeslots.has(key)) {
        addIssue(issues, { severity: "error", code: "DUPLICATE_SHIFT", sheet: "Shifts", row: timeslot.sourceRow, message: `Duplicate shift timing for “${event.title || event.opportunityKey}”.` });
      }
      seenTimeslots.add(key);
    }

    const schemaCheck = eventFormSchema.safeParse({
      title: event.title,
      opportunitySummary: event.opportunitySummary,
      opportunityDescription: event.opportunityDescription,
      opportunityImageUrl: event.opportunityImageUrl,
      opportunityCategory: event.opportunityCategory,
      opportunityEligibility: event.opportunityEligibility,
      registrationDeadline: event.registrationDeadline,
      opportunitySortOrder: event.opportunitySortOrder,
      isOpportunityPublished: false,
      slug: event.slug,
      timeslots: timeslots.map((timeslot) => ({
        label: timeslot.label,
        startsAt: timeslot.startsAt,
        endsAt: timeslot.endsAt,
        status: timeslot.status,
        registrationCapacity: timeslot.registrationCapacity,
      })),
      venue: event.venue,
      navigationDestination: event.navigationDestination,
      attireNotes: defaultAttireNotes,
      preparationNotes: null,
      programmeRundownUrl: null,
      briefingUrl: null,
      briefingAvailableAt: null,
      whatsappUrl: null,
      signInUrl: null,
      signOutUrl: null,
      signInPin: null,
      clearSignInPin: false,
      signOutPin: null,
      clearSignOutPin: false,
      isPublished: false,
    });
    if (!schemaCheck.success) {
      for (const schemaIssue of schemaCheck.error.issues) {
        addIssue(issues, {
          severity: "error",
          code: "APP_VALIDATION_FAILED",
          sheet: "Opportunities",
          row: event.sourceRow,
          message: schemaIssue.message,
        });
      }
    }

    if (event.requestedOpportunityPublish) {
      addIssue(issues, {
        severity: "warning",
        code: "PUBLICATION_HELD_FOR_REVIEW",
        sheet: "Opportunities",
        row: event.sourceRow,
        message: `“${event.title}” is marked Yes for publication. It will still be imported as an unpublished draft for staff review.`,
      });
    }

    return { ...event, timeslots };
  });

  if (events.length === 0) {
    addIssue(issues, { severity: "error", code: "NO_OPPORTUNITIES", sheet: "Opportunities", row: null, message: "No opportunity rows were found from row 6 onwards." });
  }
  if (events.length > 200) {
    addIssue(issues, { severity: "error", code: "TOO_MANY_OPPORTUNITIES", sheet: "Opportunities", row: null, message: "A workbook can import at most 200 opportunities." });
  }

  const hasErrors = issues.some((issue) => issue.severity === "error");
  return {
    valid: !hasErrors,
    events,
    issues,
    opportunityRows: draftEvents.length,
    shiftRows,
  };
}

export function toOpportunityImportPayload(events: readonly OpportunityWorkbookEvent[]) {
  return events.map((event) => ({
    title: event.title,
    slug: event.slug,
    opportunity_summary: event.opportunitySummary,
    opportunity_description: event.opportunityDescription,
    opportunity_image_url: event.opportunityImageUrl,
    opportunity_category: event.opportunityCategory,
    opportunity_eligibility: event.opportunityEligibility,
    registration_deadline: event.registrationDeadline,
    opportunity_sort_order: event.opportunitySortOrder,
    venue: event.venue,
    navigation_destination: event.navigationDestination,
    attire_notes: defaultAttireNotes,
    timeslots: event.timeslots.map((timeslot) => ({
      label: timeslot.label,
      starts_at: timeslot.startsAt,
      ends_at: timeslot.endsAt,
      status: timeslot.status,
      sort_order: timeslot.sortOrder,
      registration_capacity: timeslot.registrationCapacity,
    })),
  }));
}
