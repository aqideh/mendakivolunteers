export const ymHubDatasetKeys = [
  "personAccounts",
  "volunteerInitiatives",
  "jobPositionShifts",
  "jobPositionAssignments",
] as const;

export type YmHubDatasetKey = (typeof ymHubDatasetKeys)[number];

export type YmHubDiagnostic = Readonly<{
  row: number | null;
  severity: "error" | "warning";
  code: string;
  message: string;
}>;

export type YmHubPersonAccountRow = Readonly<{
  ymhub_volunteer_id: string;
  display_name: string;
  email: string | null;
  mobile: string | null;
  official_hours_12_months: number | null;
  official_hours_24_months: number | null;
}>;

export type YmHubActivityRow = Readonly<{
  ymhub_activity_id: string;
  title: string;
  is_ad_hoc: boolean;
  starts_on: string;
  ends_on: string;
  source_status: string;
  published: boolean;
  description: string | null;
  venue: string | null;
  registration_url: string | null;
  image_url: string | null;
}>;

export type YmHubShiftRow = Readonly<{
  ymhub_shift_id: string;
  ymhub_activity_id: string;
  job_position_id: string | null;
  job_position_name: string;
  shift_label: string | null;
  starts_at: string;
  ends_at: string;
}>;

export type YmHubAssignmentRow = Readonly<{
  ymhub_assignment_id: string;
  ymhub_volunteer_id: string;
  ymhub_activity_id: string;
  ymhub_shift_id: string | null;
  source_status: string;
  actual_duration: number | null;
}>;

export type YmHubParsedRows =
  | YmHubPersonAccountRow[]
  | YmHubActivityRow[]
  | YmHubShiftRow[]
  | YmHubAssignmentRow[];

export type YmHubParseResult = Readonly<{
  dataset: YmHubDatasetKey;
  rows: YmHubParsedRows;
  diagnostics: YmHubDiagnostic[];
}>;

const maximumRowsPerFile = 100_000;
const salesforceIdPattern = /^[A-Za-z0-9]{15}(?:[A-Za-z0-9]{3})?$/;
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeHeader(value: string): string {
  return value
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/[_/\\:>→-]+/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ");
}

function parseDelimitedText(text: string): string[][] {
  const source = text.replace(/^\uFEFF/, "");
  const firstLineEnd = source.search(/[\r\n]/);
  const firstLine = firstLineEnd >= 0 ? source.slice(0, firstLineEnd) : source;
  const delimiter = firstLine.includes("\t") && !firstLine.includes(",") ? "\t" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let value = "";
  let quoted = false;

  const pushValue = () => {
    row.push(value.trim());
    value = "";
  };
  const pushRow = () => {
    pushValue();
    if (row.some((cell) => cell.length > 0)) rows.push(row);
    row = [];
  };

  for (let index = 0; index < source.length; index += 1) {
    const character = source.charAt(index);
    if (character === '"') {
      if (quoted && source.charAt(index + 1) === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }
    if (character === delimiter && !quoted) {
      pushValue();
      continue;
    }
    if ((character === "\n" || character === "\r") && !quoted) {
      if (character === "\r" && source.charAt(index + 1) === "\n") index += 1;
      pushRow();
      continue;
    }
    value += character;
  }

  if (value.length > 0 || row.length > 0) pushRow();
  return rows;
}

function columnIndex(headers: readonly string[], aliases: readonly string[]): number {
  const normalizedAliases = aliases.map(normalizeHeader);
  return headers.findIndex((header) => normalizedAliases.includes(header));
}

function relatedInitiativeColumn(headers: readonly string[]): number {
  const direct = columnIndex(headers, [
    "Related Volunteer Initiative",
    "Related Volunteer Initiative ID",
    "Volunteer Initiative ID",
    "Parent Activity ID",
    "Parent Related Volunteer Initiative",
  ]);
  if (direct >= 0) return direct;
  return headers.findIndex(
    (header) =>
      header.includes("related volunteer initiative") ||
      (header.includes("volunteer initiative") && header.includes("id")),
  );
}

function cleanText(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  return cleaned ? cleaned : null;
}

function cleanMobile(value: string | undefined): string | null {
  const cleaned = cleanText(value);
  if (!cleaned) return null;
  return /^\d+\.0$/.test(cleaned) ? cleaned.slice(0, -2) : cleaned;
}

function parseNumber(value: string | undefined): number | null | "invalid" {
  const cleaned = value?.trim().replaceAll(",", "") ?? "";
  if (!cleaned) return null;
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : "invalid";
}

function parseDuration(value: string | undefined): number | null | "invalid" {
  const cleaned = value?.trim().toLowerCase() ?? "";
  if (!cleaned) return null;
  const numeric = parseNumber(cleaned);
  if (numeric !== "invalid" && numeric !== null) return numeric;

  const hoursMinutes = cleaned.match(/^(\d+(?:\.\d+)?)\s*h(?:ours?)?\s*(\d{1,2})?\s*m?(?:in(?:ute)?s?)?$/);
  if (hoursMinutes) {
    const hours = Number(hoursMinutes[1]);
    const minutes = Number(hoursMinutes[2] ?? "0");
    if (minutes < 60) return hours + minutes / 60;
  }

  const clock = cleaned.match(/^(\d+):(\d{1,2})$/);
  if (clock) {
    const hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    if (minutes < 60) return hours + minutes / 60;
  }
  return "invalid";
}

function parseBoolean(value: string | undefined): boolean | "invalid" {
  const cleaned = value?.trim().toLowerCase() ?? "";
  if (["true", "1", "yes", "y"].includes(cleaned)) return true;
  if (["false", "0", "no", "n"].includes(cleaned)) return false;
  return "invalid";
}

function parseDate(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(cleaned)) return null;
  const date = new Date(`${cleaned}T00:00:00Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== cleaned
    ? null
    : cleaned;
}

function parseTime(value: string | undefined): string | null {
  const cleaned = value?.trim() ?? "";
  const twentyFour = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
  if (twentyFour) {
    const hour = Number(twentyFour[1]);
    const minute = Number(twentyFour[2]);
    const second = Number(twentyFour[3] ?? "0");
    if (hour < 24 && minute < 60 && second < 60) {
      return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
    }
  }

  const twelveHour = cleaned.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([ap]m)$/i);
  if (!twelveHour) return null;
  let hour = Number(twelveHour[1]);
  const minute = Number(twelveHour[2]);
  const second = Number(twelveHour[3] ?? "0");
  if (hour < 1 || hour > 12 || minute >= 60 || second >= 60) return null;
  const meridiem = twelveHour[4]!.toLowerCase();
  if (hour === 12) hour = 0;
  if (meridiem === "pm") hour += 12;
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}:${String(second).padStart(2, "0")}`;
}

function singaporeTimestamp(date: string, time: string): string {
  return `${date}T${time}+08:00`;
}

function validateSalesforceId(
  value: string | null,
  row: number,
  label: string,
  diagnostics: YmHubDiagnostic[],
  required = true,
): value is string {
  if (!value) {
    if (required) diagnostics.push({ row, severity: "error", code: "MISSING_ID", message: `${label} is required.` });
    return false;
  }
  if (!salesforceIdPattern.test(value)) {
    diagnostics.push({ row, severity: "error", code: "INVALID_SALESFORCE_ID", message: `${label} must be a 15- or 18-character Salesforce ID.` });
    return false;
  }
  return true;
}

function requireColumns(
  headers: readonly string[],
  columns: ReadonlyArray<readonly [string, readonly string[], number?]>,
): YmHubDiagnostic[] {
  const diagnostics: YmHubDiagnostic[] = [];
  for (const [label, aliases, suppliedIndex] of columns) {
    const index = suppliedIndex ?? columnIndex(headers, aliases);
    if (index < 0) {
      diagnostics.push({
        row: 1,
        severity: "error",
        code: "MISSING_HEADER",
        message: `Required column “${label}” is missing.`,
      });
    }
  }
  return diagnostics;
}

function duplicateIdDiagnostics(ids: readonly string[]): YmHubDiagnostic[] {
  const diagnostics: YmHubDiagnostic[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    if (seen.has(id)) {
      diagnostics.push({ row: null, severity: "error", code: "DUPLICATE_SOURCE_ID", message: `Source ID ${id} appears more than once in this file.` });
    }
    seen.add(id);
  }
  return diagnostics;
}

function parsePersonAccounts(table: string[][], headers: string[]): YmHubParseResult {
  const idIndex = columnIndex(headers, ["Account ID"]);
  const nameIndex = columnIndex(headers, ["Account Name", "Name"]);
  const emailIndex = columnIndex(headers, ["Email", "Email Address"]);
  const mobileIndex = columnIndex(headers, ["Mobile", "Mobile Number", "Phone", "Phone Number"]);
  const hours12Index = columnIndex(headers, ["Total Volunteer Hours Past 12 Months", "Total Volunteer Hours (Past 12 Months)"]);
  const hours24Index = columnIndex(headers, ["Total Volunteer Hours Past 24 Months", "Total Volunteer Hours (Past 24 Months)"]);
  const diagnostics = requireColumns(headers, [
    ["Account ID", ["Account ID"], idIndex],
    ["Account Name", ["Account Name"], nameIndex],
  ]);
  const rows: YmHubPersonAccountRow[] = [];

  table.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const id = cleanText(values[idIndex]);
    const name = cleanText(values[nameIndex]);
    const email = emailIndex >= 0 ? cleanText(values[emailIndex]) : null;
    const mobile = mobileIndex >= 0 ? cleanMobile(values[mobileIndex]) : null;
    const hours12 = hours12Index >= 0 ? parseNumber(values[hours12Index]) : null;
    const hours24 = hours24Index >= 0 ? parseNumber(values[hours24Index]) : null;
    const before = diagnostics.length;

    validateSalesforceId(id, rowNumber, "Account ID", diagnostics);
    if (!name) diagnostics.push({ row: rowNumber, severity: "error", code: "MISSING_NAME", message: "Account Name is required." });
    if (email && !emailPattern.test(email)) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_EMAIL", message: "Email address is not valid." });
    if (!email) diagnostics.push({ row: rowNumber, severity: "warning", code: "MISSING_EMAIL", message: "This volunteer can be imported, but cannot activate a KELUARGA account until an email is available." });
    if (hours12 === "invalid") diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_HOURS_12", message: "Past 12 months volunteer hours must be a non-negative number." });
    if (hours24 === "invalid") diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_HOURS_24", message: "Past 24 months volunteer hours must be a non-negative number." });

    if (diagnostics.slice(before).every(({ severity }) => severity !== "error") && id && name) {
      rows.push({
        ymhub_volunteer_id: id,
        display_name: name,
        email: email?.toLowerCase() ?? null,
        mobile,
        official_hours_12_months: hours12 === "invalid" ? null : hours12,
        official_hours_24_months: hours24 === "invalid" ? null : hours24,
      });
    }
  });

  diagnostics.push(...duplicateIdDiagnostics(rows.map(({ ymhub_volunteer_id }) => ymhub_volunteer_id)));
  return { dataset: "personAccounts", rows, diagnostics };
}

function parseActivities(table: string[][], headers: string[]): YmHubParseResult {
  const idIndex = columnIndex(headers, ["Volunteer Initiative ID", "Initiative ID"]);
  const nameIndex = columnIndex(headers, ["Volunteer Initiative Name", "Initiative Name"]);
  const adHocIndex = columnIndex(headers, ["Is Ad Hoc", "Is Adhoc"]);
  const startIndex = columnIndex(headers, ["Start Date"]);
  const endIndex = columnIndex(headers, ["End Date"]);
  const statusIndex = columnIndex(headers, ["Status"]);
  const publishedIndex = columnIndex(headers, ["Published", "Is Published"]);
  const descriptionIndex = columnIndex(headers, ["Description", "Volunteer Initiative Description"]);
  const venueIndex = columnIndex(headers, ["Venue", "Venue Address", "Location"]);
  const registrationIndex = columnIndex(headers, ["Registration URL", "Application URL", "Volunteer Registration URL"]);
  const imageIndex = columnIndex(headers, ["Image URL", "Image", "Volunteer Initiative Image URL"]);
  const diagnostics = requireColumns(headers, [
    ["Volunteer Initiative ID", ["Volunteer Initiative ID"], idIndex],
    ["Volunteer Initiative Name", ["Volunteer Initiative Name"], nameIndex],
    ["Is Ad Hoc", ["Is Ad Hoc"], adHocIndex],
    ["Start Date", ["Start Date"], startIndex],
    ["End Date", ["End Date"], endIndex],
    ["Status", ["Status"], statusIndex],
  ]);
  const rows: YmHubActivityRow[] = [];

  table.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const id = cleanText(values[idIndex]);
    const title = cleanText(values[nameIndex]);
    const isAdHoc = parseBoolean(values[adHocIndex]);
    const startsOn = parseDate(values[startIndex]);
    const endsOn = parseDate(values[endIndex]);
    const status = cleanText(values[statusIndex]);
    const published = publishedIndex >= 0 ? parseBoolean(values[publishedIndex]) : true;
    const before = diagnostics.length;

    validateSalesforceId(id, rowNumber, "Volunteer Initiative ID", diagnostics);
    if (!title) diagnostics.push({ row: rowNumber, severity: "error", code: "MISSING_TITLE", message: "Volunteer Initiative Name is required." });
    if (isAdHoc === "invalid") diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_AD_HOC", message: "Is Ad Hoc must be true/false, yes/no, or 1/0." });
    if (!startsOn) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_START_DATE", message: "Start Date must use YYYY-MM-DD." });
    if (!endsOn) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_END_DATE", message: "End Date must use YYYY-MM-DD." });
    if (startsOn && endsOn && endsOn < startsOn) diagnostics.push({ row: rowNumber, severity: "error", code: "DATE_ORDER", message: "End Date cannot be before Start Date." });
    if (!status) diagnostics.push({ row: rowNumber, severity: "error", code: "MISSING_STATUS", message: "Initiative Status is required. The raw Salesforce value will be preserved." });
    if (published === "invalid") diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_PUBLISHED", message: "Published must be true/false, yes/no, or 1/0." });

    if (diagnostics.length === before && id && title && isAdHoc !== "invalid" && startsOn && endsOn && status && published !== "invalid") {
      rows.push({
        ymhub_activity_id: id,
        title,
        is_ad_hoc: isAdHoc,
        starts_on: startsOn,
        ends_on: endsOn,
        source_status: status,
        published,
        description: descriptionIndex >= 0 ? cleanText(values[descriptionIndex]) : null,
        venue: venueIndex >= 0 ? cleanText(values[venueIndex]) : null,
        registration_url: registrationIndex >= 0 ? cleanText(values[registrationIndex]) : null,
        image_url: imageIndex >= 0 ? cleanText(values[imageIndex]) : null,
      });
    }
  });

  diagnostics.push(...duplicateIdDiagnostics(rows.map(({ ymhub_activity_id }) => ymhub_activity_id)));
  return { dataset: "volunteerInitiatives", rows, diagnostics };
}

function parseShifts(table: string[][], headers: string[]): YmHubParseResult {
  const idIndex = columnIndex(headers, ["Job Position Shift ID", "Shift ID"]);
  const activityIndex = relatedInitiativeColumn(headers);
  const jobPositionIdIndex = columnIndex(headers, ["Job Position ID", "Position ID"]);
  const jobPositionNameIndex = columnIndex(headers, ["Job Position Name", "Position Name"]);
  const shiftLabelIndex = columnIndex(headers, ["Shift Name", "Shift Label", "Session Name"]);
  const startDateIndex = columnIndex(headers, ["Start Date"]);
  const startTimeIndex = columnIndex(headers, ["Start Time"]);
  const endDateIndex = columnIndex(headers, ["End Date"]);
  const endTimeIndex = columnIndex(headers, ["End Time"]);
  const diagnostics = requireColumns(headers, [
    ["Job Position Shift ID", ["Job Position Shift ID"], idIndex],
    ["Related Volunteer Initiative", ["Related Volunteer Initiative"], activityIndex],
    ["Job Position Name", ["Job Position Name"], jobPositionNameIndex],
    ["Start Date", ["Start Date"], startDateIndex],
    ["Start Time", ["Start Time"], startTimeIndex],
    ["End Date", ["End Date"], endDateIndex],
    ["End Time", ["End Time"], endTimeIndex],
  ]);
  const rows: YmHubShiftRow[] = [];

  table.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const id = cleanText(values[idIndex]);
    const activityId = cleanText(values[activityIndex]);
    const jobPositionName = cleanText(values[jobPositionNameIndex]);
    const startDate = parseDate(values[startDateIndex]);
    const startTime = parseTime(values[startTimeIndex]);
    const endDate = parseDate(values[endDateIndex]);
    const endTime = parseTime(values[endTimeIndex]);
    const before = diagnostics.length;

    validateSalesforceId(id, rowNumber, "Job Position Shift ID", diagnostics);
    validateSalesforceId(activityId, rowNumber, "Related Volunteer Initiative", diagnostics);
    if (!jobPositionName) diagnostics.push({ row: rowNumber, severity: "error", code: "MISSING_POSITION", message: "Job Position Name is required." });
    if (!startDate) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_START_DATE", message: "Start Date must use YYYY-MM-DD." });
    if (!startTime) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_START_TIME", message: "Start Time must use a valid 24-hour or AM/PM time." });
    if (!endDate) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_END_DATE", message: "End Date must use YYYY-MM-DD." });
    if (!endTime) diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_END_TIME", message: "End Time must use a valid 24-hour or AM/PM time." });

    if (diagnostics.length === before && id && activityId && jobPositionName && startDate && startTime && endDate && endTime) {
      const startsAt = singaporeTimestamp(startDate, startTime);
      const endsAt = singaporeTimestamp(endDate, endTime);
      if (new Date(endsAt).getTime() < new Date(startsAt).getTime()) {
        diagnostics.push({ row: rowNumber, severity: "error", code: "TIME_ORDER", message: "Shift end cannot be before shift start." });
        return;
      }
      const jobPositionId = jobPositionIdIndex >= 0 ? cleanText(values[jobPositionIdIndex]) : null;
      if (jobPositionId && !salesforceIdPattern.test(jobPositionId)) {
        diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_POSITION_ID", message: "Job Position ID must be a 15- or 18-character Salesforce ID." });
        return;
      }
      rows.push({
        ymhub_shift_id: id,
        ymhub_activity_id: activityId,
        job_position_id: jobPositionId,
        job_position_name: jobPositionName,
        shift_label: shiftLabelIndex >= 0 ? cleanText(values[shiftLabelIndex]) : null,
        starts_at: startsAt,
        ends_at: endsAt,
      });
    }
  });

  diagnostics.push(...duplicateIdDiagnostics(rows.map(({ ymhub_shift_id }) => ymhub_shift_id)));
  return { dataset: "jobPositionShifts", rows, diagnostics };
}

function parseAssignments(table: string[][], headers: string[]): YmHubParseResult {
  const idIndex = columnIndex(headers, ["Job Position Assignment ID", "Assignment ID"]);
  const volunteerIndex = columnIndex(headers, ["Assigned Account", "Assigned Account ID", "Account ID"]);
  const activityIndex = relatedInitiativeColumn(headers);
  const shiftIndex = columnIndex(headers, ["Assigned Position Shift", "Assigned Position Shift ID", "Job Position Shift ID"]);
  const statusIndex = columnIndex(headers, ["Status"]);
  const durationIndex = columnIndex(headers, ["Actual Duration", "Verified Hours"]);
  const diagnostics = requireColumns(headers, [
    ["Job Position Assignment ID", ["Job Position Assignment ID"], idIndex],
    ["Assigned Account", ["Assigned Account"], volunteerIndex],
    ["Related Volunteer Initiative", ["Related Volunteer Initiative"], activityIndex],
    ["Status", ["Status"], statusIndex],
  ]);
  const rows: YmHubAssignmentRow[] = [];

  table.slice(1).forEach((values, offset) => {
    const rowNumber = offset + 2;
    const id = cleanText(values[idIndex]);
    const volunteerId = cleanText(values[volunteerIndex]);
    const activityId = cleanText(values[activityIndex]);
    const shiftId = shiftIndex >= 0 ? cleanText(values[shiftIndex]) : null;
    const status = cleanText(values[statusIndex]);
    const duration = durationIndex >= 0 ? parseDuration(values[durationIndex]) : null;
    const before = diagnostics.length;

    validateSalesforceId(id, rowNumber, "Job Position Assignment ID", diagnostics);
    validateSalesforceId(volunteerId, rowNumber, "Assigned Account", diagnostics);
    validateSalesforceId(activityId, rowNumber, "Related Volunteer Initiative", diagnostics);
    if (shiftId) validateSalesforceId(shiftId, rowNumber, "Assigned Position Shift", diagnostics, false);
    if (!status) diagnostics.push({ row: rowNumber, severity: "error", code: "MISSING_STATUS", message: "Assignment Status is required. The raw Salesforce value will be preserved." });
    if (duration === "invalid") diagnostics.push({ row: rowNumber, severity: "error", code: "INVALID_DURATION", message: "Actual Duration must be a non-negative decimal number or a duration such as 2h30m or 2:30." });

    if (diagnostics.length === before && id && volunteerId && activityId && status) {
      rows.push({
        ymhub_assignment_id: id,
        ymhub_volunteer_id: volunteerId,
        ymhub_activity_id: activityId,
        ymhub_shift_id: shiftId,
        source_status: status,
        actual_duration: duration === "invalid" ? null : duration,
      });
    }
  });

  diagnostics.push(...duplicateIdDiagnostics(rows.map(({ ymhub_assignment_id }) => ymhub_assignment_id)));
  return { dataset: "jobPositionAssignments", rows, diagnostics };
}

export function parseYmHubCsv(dataset: YmHubDatasetKey, text: string): YmHubParseResult {
  const table = parseDelimitedText(text);
  if (table.length < 2) {
    return {
      dataset,
      rows: [],
      diagnostics: [{ row: null, severity: "error", code: "EMPTY_FILE", message: "Include a header row and at least one data row." }],
    };
  }
  if (table.length - 1 > maximumRowsPerFile) {
    return {
      dataset,
      rows: [],
      diagnostics: [{ row: null, severity: "error", code: "TOO_MANY_ROWS", message: `A single report is limited to ${maximumRowsPerFile.toLocaleString("en-SG")} rows in this importer.` }],
    };
  }

  const headers = table[0]!.map(normalizeHeader);
  if (dataset === "personAccounts") return parsePersonAccounts(table, headers);
  if (dataset === "volunteerInitiatives") return parseActivities(table, headers);
  if (dataset === "jobPositionShifts") return parseShifts(table, headers);
  return parseAssignments(table, headers);
}

export function hasBlockingYmHubDiagnostics(result: YmHubParseResult): boolean {
  return result.diagnostics.some(({ severity }) => severity === "error");
}
