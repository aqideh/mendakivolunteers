export const ymHubImportTemplateVersion = "1.0-20260915";
export const ymHubImportMaxBytes = 3_500_000;

export const ymHubDatasetKeys = [
  "person_accounts",
  "volunteer_initiatives",
  "job_position_shifts",
  "job_position_assignments",
] as const;

export type YmHubDatasetKey = (typeof ymHubDatasetKeys)[number];
export type YmHubIssueSeverity = "error" | "warning" | "info";

export type YmHubImportIssue = Readonly<{
  severity: YmHubIssueSeverity;
  code: string;
  message: string;
  dataset?: YmHubDatasetKey;
  row?: number;
}>;

export type YmHubDatasetPreview = Readonly<{
  dataset: YmHubDatasetKey;
  label: string;
  fileName: string;
  sha256: string;
  rowCount: number;
  importedRowCount: number;
  skippedRowCount: number;
}>;

export type YmHubPersonAccount = Readonly<{
  ymhub_volunteer_id: string;
  display_name: string;
  primary_email_normalized: string | null;
  mobile: string | null;
  official_hours_12_months: number | null;
  official_hours_24_months: number | null;
}>;

export type YmHubActivity = Readonly<{
  ymhub_activity_id: string;
  title: string;
  is_ad_hoc: boolean;
  starts_on: string;
  ends_on: string;
  source_status: string;
  published: true;
}>;

export type YmHubShift = Readonly<{
  ymhub_shift_id: string;
  ymhub_activity_id: string;
  job_position_name: string;
  starts_at: string;
  ends_at: string;
}>;

export type YmHubAssignment = Readonly<{
  ymhub_assignment_id: string;
  ymhub_volunteer_id: string;
  ymhub_activity_id: string;
  ymhub_shift_id: string | null;
  source_status: string;
  actual_duration: number | null;
}>;

export type YmHubParsedImport = Readonly<{
  valid: boolean;
  issues: YmHubImportIssue[];
  datasets: YmHubDatasetPreview[];
  personAccounts: YmHubPersonAccount[];
  activities: YmHubActivity[];
  shifts: YmHubShift[];
  assignments: YmHubAssignment[];
}>;

type FileInput = Readonly<{
  fileName: string;
  sha256: string;
  text: string;
}>;

export type YmHubImportFiles = Readonly<Record<YmHubDatasetKey, FileInput>>;

type DatasetDefinition = Readonly<{
  label: string;
  headers: readonly string[];
}>;

export const ymHubDatasetDefinitions: Readonly<Record<YmHubDatasetKey, DatasetDefinition>> = {
  person_accounts: {
    label: "Person Accounts",
    headers: [
      "Account ID",
      "Account Name",
      "Email",
      "Mobile",
      "Total Volunteer Hours (Past 12 Months)",
      "Total Volunteer Hours (Past 24 Months)",
    ],
  },
  volunteer_initiatives: {
    label: "Volunteer Initiatives",
    headers: [
      "Volunteer Initiative ID",
      "Volunteer Initiative Name",
      "Is Ad Hoc",
      "Start Date",
      "End Date",
      "Status",
    ],
  },
  job_position_shifts: {
    label: "Job Position Shifts",
    headers: [
      "Job Position Shift ID",
      "Job Position: Related Volunteer Initiative: Volunteer Initiative ID",
      "Job Position Name",
      "Start Date & Time",
      "End Date & Time",
    ],
  },
  job_position_assignments: {
    label: "Job Position Assignments",
    headers: [
      "Job Position Assignment ID",
      "Assigned Account",
      "Related Volunteer Initiative",
      "Assigned Position Shift",
      "Status",
      "Actual Duration",
    ],
  },
};

function issue(
  issues: YmHubImportIssue[],
  severity: YmHubIssueSeverity,
  code: string,
  message: string,
  dataset?: YmHubDatasetKey,
  row?: number,
) {
  const item: {
    severity: YmHubIssueSeverity;
    code: string;
    message: string;
    dataset?: YmHubDatasetKey;
    row?: number;
  } = { severity, code, message };
  if (dataset !== undefined) item.dataset = dataset;
  if (row !== undefined) item.row = row;
  issues.push(item);
}

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;

  const input = text.replace(/^\uFEFF/, "");
  for (let index = 0; index < input.length; index += 1) {
    const character = input[index];

    if (inQuotes) {
      if (character === '"') {
        if (input[index + 1] === '"') {
          field += '"';
          index += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"' && field.length === 0) {
      inQuotes = true;
      continue;
    }
    if (character === ",") {
      row.push(field);
      field = "";
      continue;
    }
    if (character === "\n" || character === "\r") {
      if (character === "\r" && input[index + 1] === "\n") index += 1;
      row.push(field);
      field = "";
      if (row.some((value) => value.trim().length > 0)) rows.push(row);
      row = [];
      continue;
    }
    field += character;
  }

  if (inQuotes) throw new Error("CSV contains an unclosed quoted field");
  row.push(field);
  if (row.some((value) => value.trim().length > 0)) rows.push(row);
  return rows;
}

function parseDataset(
  dataset: YmHubDatasetKey,
  input: FileInput,
  issues: YmHubImportIssue[],
): { rows: string[][]; rowCount: number } {
  let rows: string[][];
  try {
    rows = parseCsv(input.text);
  } catch {
    issue(
      issues,
      "error",
      "CSV_SYNTAX",
      "The CSV could not be parsed. Check quoted fields and line breaks, then export it again from Salesforce.",
      dataset,
    );
    return { rows: [], rowCount: 0 };
  }

  if (rows.length === 0) {
    issue(issues, "error", "CSV_EMPTY", "The CSV is empty.", dataset);
    return { rows: [], rowCount: 0 };
  }

  const expected = ymHubDatasetDefinitions[dataset].headers;
  const actual = (rows[0] ?? []).map((value) => value.trim());
  const headersMatch =
    actual.length === expected.length &&
    expected.every((header, index) => actual[index] === header);

  if (!headersMatch) {
    issue(
      issues,
      "error",
      "CSV_HEADERS",
      `Header mismatch. Expected: ${expected.join(" | ")}`,
      dataset,
      1,
    );
    return { rows: [], rowCount: Math.max(rows.length - 1, 0) };
  }

  const dataRows = rows.slice(1);
  dataRows.forEach((values, index) => {
    if (values.length !== expected.length) {
      issue(
        issues,
        "error",
        "CSV_COLUMN_COUNT",
        `Expected ${expected.length} columns but found ${values.length}.`,
        dataset,
        index + 2,
      );
    }
  });

  return { rows: dataRows, rowCount: dataRows.length };
}

function required(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  fieldName: string,
  issues: YmHubImportIssue[],
): string | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    issue(issues, "error", "REQUIRED_FIELD", `${fieldName} is required.`, dataset, row);
    return null;
  }
  return normalized;
}

function optional(value: string | undefined): string | null {
  const normalized = value?.trim() ?? "";
  return normalized ? normalized : null;
}

function nonNegativeNumber(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  fieldName: string,
  issues: YmHubImportIssue[],
): number | null {
  const normalized = value?.trim() ?? "";
  if (!normalized) return null;
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) {
    issue(
      issues,
      "error",
      "INVALID_NUMBER",
      `${fieldName} must be a non-negative number or blank.`,
      dataset,
      row,
    );
    return null;
  }
  return parsed;
}

function booleanValue(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  fieldName: string,
  issues: YmHubImportIssue[],
): boolean | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (["1", "true", "yes", "y"].includes(normalized)) return true;
  if (["0", "false", "no", "n"].includes(normalized)) return false;
  issue(
    issues,
    "error",
    "INVALID_BOOLEAN",
    `${fieldName} must be 1/0 or true/false.`,
    dataset,
    row,
  );
  return null;
}

function dateValue(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  fieldName: string,
  issues: YmHubImportIssue[],
): string | null {
  const normalized = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    issue(
      issues,
      "error",
      "INVALID_DATE",
      `${fieldName} must use YYYY-MM-DD.`,
      dataset,
      row,
    );
    return null;
  }
  const parsed = new Date(`${normalized}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== normalized) {
    issue(issues, "error", "INVALID_DATE", `${fieldName} is not a valid date.`, dataset, row);
    return null;
  }
  return normalized;
}

function singaporeTimestamp(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  fieldName: string,
  issues: YmHubImportIssue[],
): string | null {
  const normalized = value?.trim() ?? "";
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\+08:00$/.test(normalized)) {
    issue(
      issues,
      "error",
      "INVALID_TIMESTAMP",
      `${fieldName} must use YYYY-MM-DDTHH:MM:SS+08:00.`,
      dataset,
      row,
    );
    return null;
  }
  if (Number.isNaN(Date.parse(normalized))) {
    issue(issues, "error", "INVALID_TIMESTAMP", `${fieldName} is not a valid timestamp.`, dataset, row);
    return null;
  }
  return normalized;
}

function emailValue(
  value: string | undefined,
  dataset: YmHubDatasetKey,
  row: number,
  issues: YmHubImportIssue[],
): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  if (!normalized) {
    issue(
      issues,
      "warning",
      "MISSING_EMAIL",
      "Email is blank. This volunteer can be imported but cannot activate a KELUARGA account until YM Hub contains an email address.",
      dataset,
      row,
    );
    return null;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized) || normalized.length > 254) {
    issue(issues, "error", "INVALID_EMAIL", "Email is not valid.", dataset, row);
    return null;
  }
  return normalized;
}

function recordDuplicate(
  seen: Map<string, number>,
  id: string,
  dataset: YmHubDatasetKey,
  row: number,
  issues: YmHubImportIssue[],
): boolean {
  const firstRow = seen.get(id);
  if (firstRow !== undefined) {
    issue(
      issues,
      "error",
      "DUPLICATE_SOURCE_ID",
      `Duplicate source ID. The same ID first appeared on row ${firstRow}.`,
      dataset,
      row,
    );
    return true;
  }
  seen.set(id, row);
  return false;
}

export function parseYmHubImportFiles(files: YmHubImportFiles): YmHubParsedImport {
  const issues: YmHubImportIssue[] = [];
  const personAccounts: YmHubPersonAccount[] = [];
  const activities: YmHubActivity[] = [];
  const shifts: YmHubShift[] = [];
  const allAssignments: YmHubAssignment[] = [];
  const rowCounts = new Map<YmHubDatasetKey, number>();

  const persons = parseDataset("person_accounts", files.person_accounts, issues);
  rowCounts.set("person_accounts", persons.rowCount);
  const personIds = new Set<string>();
  const personSeen = new Map<string, number>();
  const emailCounts = new Map<string, number>();
  persons.rows.forEach((values, index) => {
    const row = index + 2;
    const id = required(values[0], "person_accounts", row, "Account ID", issues);
    const name = required(values[1], "person_accounts", row, "Account Name", issues);
    const email = emailValue(values[2], "person_accounts", row, issues);
    const mobile = optional(values[3]);
    const hours12 = nonNegativeNumber(
      values[4],
      "person_accounts",
      row,
      "Total Volunteer Hours (Past 12 Months)",
      issues,
    );
    const hours24 = nonNegativeNumber(
      values[5],
      "person_accounts",
      row,
      "Total Volunteer Hours (Past 24 Months)",
      issues,
    );
    if (!id || !name || recordDuplicate(personSeen, id, "person_accounts", row, issues)) return;
    personIds.add(id);
    if (email) emailCounts.set(email, (emailCounts.get(email) ?? 0) + 1);
    personAccounts.push({
      ymhub_volunteer_id: id,
      display_name: name,
      primary_email_normalized: email,
      mobile,
      official_hours_12_months: hours12,
      official_hours_24_months: hours24,
    });
  });
  const sharedEmailRows = [...emailCounts.values()].filter((count) => count > 1).reduce((sum, count) => sum + count, 0);
  if (sharedEmailRows > 0) {
    issue(
      issues,
      "warning",
      "SHARED_EMAIL",
      `${sharedEmailRows} Person Account rows share an email with another source record. They will import, but KELUARGA account linking will require review.`,
      "person_accounts",
    );
  }

  const activityData = parseDataset("volunteer_initiatives", files.volunteer_initiatives, issues);
  rowCounts.set("volunteer_initiatives", activityData.rowCount);
  const activityIds = new Set<string>();
  const activitySeen = new Map<string, number>();
  activityData.rows.forEach((values, index) => {
    const row = index + 2;
    const id = required(values[0], "volunteer_initiatives", row, "Volunteer Initiative ID", issues);
    const title = required(values[1], "volunteer_initiatives", row, "Volunteer Initiative Name", issues);
    const isAdHoc = booleanValue(values[2], "volunteer_initiatives", row, "Is Ad Hoc", issues);
    const startsOn = dateValue(values[3], "volunteer_initiatives", row, "Start Date", issues);
    const endsOn = dateValue(values[4], "volunteer_initiatives", row, "End Date", issues);
    const status = required(values[5], "volunteer_initiatives", row, "Status", issues);
    if (!id || !title || isAdHoc === null || !startsOn || !endsOn || !status) return;
    if (recordDuplicate(activitySeen, id, "volunteer_initiatives", row, issues)) return;
    if (endsOn < startsOn) {
      issue(issues, "error", "DATE_ORDER", "End Date is before Start Date.", "volunteer_initiatives", row);
      return;
    }
    activityIds.add(id);
    activities.push({
      ymhub_activity_id: id,
      title,
      is_ad_hoc: isAdHoc,
      starts_on: startsOn,
      ends_on: endsOn,
      source_status: status,
      published: true,
    });
  });

  const shiftData = parseDataset("job_position_shifts", files.job_position_shifts, issues);
  rowCounts.set("job_position_shifts", shiftData.rowCount);
  const shiftSeen = new Map<string, number>();
  const shiftActivities = new Map<string, string>();
  shiftData.rows.forEach((values, index) => {
    const row = index + 2;
    const id = required(values[0], "job_position_shifts", row, "Job Position Shift ID", issues);
    const activityId = required(
      values[1],
      "job_position_shifts",
      row,
      "Related Volunteer Initiative ID",
      issues,
    );
    const positionName = required(values[2], "job_position_shifts", row, "Job Position Name", issues);
    const startsAt = singaporeTimestamp(values[3], "job_position_shifts", row, "Start Date & Time", issues);
    const endsAt = singaporeTimestamp(values[4], "job_position_shifts", row, "End Date & Time", issues);
    if (!id || !activityId || !positionName || !startsAt || !endsAt) return;
    if (recordDuplicate(shiftSeen, id, "job_position_shifts", row, issues)) return;
    if (!activityIds.has(activityId)) {
      issue(
        issues,
        "error",
        "UNKNOWN_ACTIVITY_REFERENCE",
        "The shift references a Volunteer Initiative that is not present in this batch.",
        "job_position_shifts",
        row,
      );
      return;
    }
    if (Date.parse(endsAt) < Date.parse(startsAt)) {
      issue(issues, "error", "TIME_ORDER", "End Date & Time is before Start Date & Time.", "job_position_shifts", row);
      return;
    }
    shiftActivities.set(id, activityId);
    shifts.push({
      ymhub_shift_id: id,
      ymhub_activity_id: activityId,
      job_position_name: positionName,
      starts_at: startsAt,
      ends_at: endsAt,
    });
  });

  const assignmentData = parseDataset(
    "job_position_assignments",
    files.job_position_assignments,
    issues,
  );
  rowCounts.set("job_position_assignments", assignmentData.rowCount);
  const assignmentSeen = new Map<string, number>();
  assignmentData.rows.forEach((values, index) => {
    const row = index + 2;
    const id = required(values[0], "job_position_assignments", row, "Job Position Assignment ID", issues);
    const volunteerId = required(values[1], "job_position_assignments", row, "Assigned Account", issues);
    const activityId = required(
      values[2],
      "job_position_assignments",
      row,
      "Related Volunteer Initiative",
      issues,
    );
    const shiftId = optional(values[3]);
    const status = required(values[4], "job_position_assignments", row, "Status", issues);
    const actualDuration = nonNegativeNumber(
      values[5],
      "job_position_assignments",
      row,
      "Actual Duration",
      issues,
    );
    if (!id || !volunteerId || !activityId || !status) return;
    if (recordDuplicate(assignmentSeen, id, "job_position_assignments", row, issues)) return;

    if (activityIds.has(activityId)) {
      if (!personIds.has(volunteerId)) {
        issue(
          issues,
          "error",
          "UNKNOWN_VOLUNTEER_REFERENCE",
          "The assignment references an Assigned Account that is not present in the Person Account file.",
          "job_position_assignments",
          row,
        );
      }
      if (shiftId && !shiftActivities.has(shiftId)) {
        issue(
          issues,
          "error",
          "UNKNOWN_SHIFT_REFERENCE",
          "The assignment references a shift that is not present in the Job Position Shift file.",
          "job_position_assignments",
          row,
        );
      }
      if (shiftId && shiftActivities.get(shiftId) && shiftActivities.get(shiftId) !== activityId) {
        issue(
          issues,
          "error",
          "SHIFT_ACTIVITY_MISMATCH",
          "The assignment's shift belongs to a different Volunteer Initiative.",
          "job_position_assignments",
          row,
        );
      }
    }

    allAssignments.push({
      ymhub_assignment_id: id,
      ymhub_volunteer_id: volunteerId,
      ymhub_activity_id: activityId,
      ymhub_shift_id: shiftId,
      source_status: status,
      actual_duration: actualDuration,
    });
  });

  const assignments = allAssignments.filter(({ ymhub_activity_id }) => activityIds.has(ymhub_activity_id));
  const skippedAssignments = allAssignments.length - assignments.length;
  if (skippedAssignments > 0) {
    issue(
      issues,
      "info",
      "ASSIGNMENTS_OUT_OF_SCOPE",
      `${skippedAssignments} assignment row${skippedAssignments === 1 ? "" : "s"} reference activities outside the Published Volunteer Initiative report and will be recorded as skipped, not imported into the current activity projection.`,
      "job_position_assignments",
    );
  }

  const datasets = ymHubDatasetKeys.map((dataset): YmHubDatasetPreview => {
    const importedRowCount =
      dataset === "person_accounts"
        ? personAccounts.length
        : dataset === "volunteer_initiatives"
          ? activities.length
          : dataset === "job_position_shifts"
            ? shifts.length
            : assignments.length;
    const rowCount = rowCounts.get(dataset) ?? 0;
    return {
      dataset,
      label: ymHubDatasetDefinitions[dataset].label,
      fileName: files[dataset].fileName,
      sha256: files[dataset].sha256,
      rowCount,
      importedRowCount,
      skippedRowCount: Math.max(rowCount - importedRowCount, 0),
    };
  });

  return {
    valid: !issues.some(({ severity }) => severity === "error"),
    issues,
    datasets,
    personAccounts,
    activities,
    shifts,
    assignments,
  };
}
