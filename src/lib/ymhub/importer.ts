import {
  hasBlockingYmHubDiagnostics,
  parseYmHubCsv,
  type YmHubActivityRow,
  type YmHubAssignmentRow,
  type YmHubDatasetKey as ParserDatasetKey,
  type YmHubDiagnostic,
  type YmHubPersonAccountRow,
  type YmHubShiftRow,
} from "./batch-import";

export const ymHubImportTemplateVersion = "1.0-20260915";
export const ymHubImportMaxFileBytes = 2_000_000;
export const ymHubImportMaxTotalBytes = 3_500_000;

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

export type YmHubActivity = YmHubActivityRow;
export type YmHubShift = YmHubShiftRow;
export type YmHubAssignment = YmHubAssignmentRow;

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
      "Related Volunteer Initiative",
      "Job Position Name",
      "Start Date + Start Time",
      "End Date + End Time",
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

const parserKeyByDataset: Readonly<Record<YmHubDatasetKey, ParserDatasetKey>> = {
  person_accounts: "personAccounts",
  volunteer_initiatives: "volunteerInitiatives",
  job_position_shifts: "jobPositionShifts",
  job_position_assignments: "jobPositionAssignments",
};

export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  const source = text.replace(/^\uFEFF/, "");
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
    if (character === "," && !quoted) {
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
  if (quoted) throw new Error("CSV contains an unclosed quoted field");
  if (value.length > 0 || row.length > 0) pushRow();
  return rows;
}

function convertDiagnostic(dataset: YmHubDatasetKey, diagnostic: YmHubDiagnostic): YmHubImportIssue {
  return {
    severity: diagnostic.severity,
    code: diagnostic.code,
    message: diagnostic.message,
    dataset,
    ...(diagnostic.row === null ? {} : { row: diagnostic.row }),
  };
}

function countRows(text: string): number {
  try {
    return Math.max(parseCsv(text).length - 1, 0);
  } catch {
    return 0;
  }
}

function personRows(rows: readonly YmHubPersonAccountRow[]): YmHubPersonAccount[] {
  return rows.map((row) => ({
    ymhub_volunteer_id: row.ymhub_volunteer_id,
    display_name: row.display_name,
    primary_email_normalized: row.email?.toLowerCase() ?? null,
    mobile: row.mobile,
    official_hours_12_months: row.official_hours_12_months,
    official_hours_24_months: row.official_hours_24_months,
  }));
}

function pushIssue(
  issues: YmHubImportIssue[],
  severity: YmHubIssueSeverity,
  code: string,
  message: string,
  dataset?: YmHubDatasetKey,
) {
  issues.push({ severity, code, message, ...(dataset ? { dataset } : {}) });
}

export function parseYmHubImportFiles(files: YmHubImportFiles): YmHubParsedImport {
  const parsed = {
    person_accounts: parseYmHubCsv(parserKeyByDataset.person_accounts, files.person_accounts.text),
    volunteer_initiatives: parseYmHubCsv(parserKeyByDataset.volunteer_initiatives, files.volunteer_initiatives.text),
    job_position_shifts: parseYmHubCsv(parserKeyByDataset.job_position_shifts, files.job_position_shifts.text),
    job_position_assignments: parseYmHubCsv(parserKeyByDataset.job_position_assignments, files.job_position_assignments.text),
  } as const;

  const issues: YmHubImportIssue[] = ymHubDatasetKeys.flatMap((dataset) =>
    parsed[dataset].diagnostics.map((diagnostic) => convertDiagnostic(dataset, diagnostic)),
  );

  const personAccounts = personRows(parsed.person_accounts.rows as YmHubPersonAccountRow[]);
  const activities = parsed.volunteer_initiatives.rows as YmHubActivity[];
  const shifts = parsed.job_position_shifts.rows as YmHubShift[];
  const assignments = parsed.job_position_assignments.rows as YmHubAssignment[];

  const personIds = new Set(personAccounts.map(({ ymhub_volunteer_id }) => ymhub_volunteer_id));
  const activityIds = new Set(activities.map(({ ymhub_activity_id }) => ymhub_activity_id));
  const shiftActivities = new Map(shifts.map(({ ymhub_shift_id, ymhub_activity_id }) => [ymhub_shift_id, ymhub_activity_id]));

  for (const shift of shifts) {
    if (!activityIds.has(shift.ymhub_activity_id)) {
      pushIssue(
        issues,
        "error",
        "UNKNOWN_ACTIVITY_REFERENCE",
        `Shift ${shift.ymhub_shift_id} references an Initiative that is not present in this batch.`,
        "job_position_shifts",
      );
    }
  }

  let unresolvedAssignmentVolunteers = 0;
  let unresolvedAssignmentShifts = 0;
  for (const assignment of assignments) {
    if (!personIds.has(assignment.ymhub_volunteer_id)) unresolvedAssignmentVolunteers += 1;
    if (assignment.ymhub_shift_id && !shiftActivities.has(assignment.ymhub_shift_id)) {
      unresolvedAssignmentShifts += 1;
    }
    const knownShiftActivity = assignment.ymhub_shift_id
      ? shiftActivities.get(assignment.ymhub_shift_id)
      : undefined;
    if (knownShiftActivity && knownShiftActivity !== assignment.ymhub_activity_id) {
      pushIssue(
        issues,
        "error",
        "SHIFT_ACTIVITY_MISMATCH",
        `Assignment ${assignment.ymhub_assignment_id} references a shift belonging to a different Initiative.`,
        "job_position_assignments",
      );
    }
  }

  if (unresolvedAssignmentVolunteers > 0) {
    pushIssue(
      issues,
      "warning",
      "ASSIGNMENT_VOLUNTEER_NOT_IN_BATCH",
      `${unresolvedAssignmentVolunteers} assignment row${unresolvedAssignmentVolunteers === 1 ? "" : "s"} reference Person Accounts outside this batch. The Salesforce IDs will still be retained and can resolve on a later import.`,
      "job_position_assignments",
    );
  }
  if (unresolvedAssignmentShifts > 0) {
    pushIssue(
      issues,
      "warning",
      "ASSIGNMENT_SHIFT_NOT_IN_BATCH",
      `${unresolvedAssignmentShifts} assignment row${unresolvedAssignmentShifts === 1 ? "" : "s"} reference shifts outside this batch. The Salesforce IDs will still be retained and can resolve on a later import.`,
      "job_position_assignments",
    );
  }

  const sharedEmails = new Map<string, number>();
  for (const person of personAccounts) {
    if (!person.primary_email_normalized) continue;
    sharedEmails.set(
      person.primary_email_normalized,
      (sharedEmails.get(person.primary_email_normalized) ?? 0) + 1,
    );
  }
  const sharedEmailRows = [...sharedEmails.values()]
    .filter((count) => count > 1)
    .reduce((sum, count) => sum + count, 0);
  if (sharedEmailRows > 0) {
    pushIssue(
      issues,
      "warning",
      "SHARED_EMAIL",
      `${sharedEmailRows} Person Account rows share an email with another source record. They will import, but account linking may require staff review.`,
      "person_accounts",
    );
  }

  const datasets = ymHubDatasetKeys.map((dataset): YmHubDatasetPreview => {
    const rowCount = countRows(files[dataset].text);
    const importedRowCount =
      dataset === "person_accounts"
        ? personAccounts.length
        : dataset === "volunteer_initiatives"
          ? activities.length
          : dataset === "job_position_shifts"
            ? shifts.length
            : assignments.length;
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

  const parserBlocked = ymHubDatasetKeys.some((dataset) => hasBlockingYmHubDiagnostics(parsed[dataset]));
  return {
    valid: !parserBlocked && !issues.some(({ severity }) => severity === "error"),
    issues,
    datasets,
    personAccounts,
    activities,
    shifts,
    assignments,
  };
}
