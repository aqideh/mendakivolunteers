"use server";

import { createHash } from "node:crypto";
import { revalidatePath } from "next/cache";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  parseYmHubImportFiles,
  ymHubDatasetKeys,
  ymHubImportMaxFileBytes,
  ymHubImportMaxTotalBytes,
  ymHubImportTemplateVersion,
  type YmHubDatasetPreview,
  type YmHubImportFiles,
  type YmHubImportIssue,
} from "@/lib/ymhub/importer";

export type YmHubImportActionState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  datasets?: YmHubDatasetPreview[];
  issues?: YmHubImportIssue[];
  batchId?: string;
}>;

const datePattern = /^\d{4}-\d{2}-\d{2}$/;

function errorState(message: string, issues?: YmHubImportIssue[]): YmHubImportActionState {
  return issues ? { status: "error", message, issues } : { status: "error", message };
}

function getFile(formData: FormData, key: string): File | null {
  const value = formData.get(key);
  return value instanceof File && value.size > 0 ? value : null;
}

async function readFiles(formData: FormData): Promise<YmHubImportFiles | YmHubImportActionState> {
  const collected = new Map<string, { fileName: string; sha256: string; text: string }>();
  let totalBytes = 0;

  for (const dataset of ymHubDatasetKeys) {
    const file = getFile(formData, dataset);
    if (!file) return errorState(`Select the ${dataset.replaceAll("_", " ")} CSV.`);
    if (!file.name.toLowerCase().endsWith(".csv")) {
      return errorState(`${file.name} must be a CSV file.`);
    }
    if (file.size > ymHubImportMaxFileBytes) {
      return errorState(`${file.name} is larger than the 2 MB per-file limit.`);
    }
    totalBytes += file.size;
    if (totalBytes > ymHubImportMaxTotalBytes) {
      return errorState("The four CSV files together exceed the 3.5 MB batch limit.");
    }

    const bytes = Buffer.from(await file.arrayBuffer());
    collected.set(dataset, {
      fileName: file.name.slice(0, 255),
      sha256: createHash("sha256").update(bytes).digest("hex"),
      text: bytes.toString("utf8"),
    });
  }

  return Object.fromEntries(collected) as YmHubImportFiles;
}

function isActionState(value: YmHubImportFiles | YmHubImportActionState): value is YmHubImportActionState {
  return "status" in value;
}

export async function commitYmHubImportBatch(
  _previousState: YmHubImportActionState,
  formData: FormData,
): Promise<YmHubImportActionState> {
  const periodStart = String(formData.get("periodStart") ?? "").trim();
  const periodEnd = String(formData.get("periodEnd") ?? "").trim();
  if (!datePattern.test(periodStart) || !datePattern.test(periodEnd) || periodEnd < periodStart) {
    return errorState("Enter a valid reporting period with the end date on or after the start date.");
  }

  const files = await readFiles(formData);
  if (isActionState(files)) return files;

  const parsed = parseYmHubImportFiles(files);
  if (!parsed.valid) {
    return errorState(
      "The batch was not imported. Fix the validation errors and preview the files again.",
      parsed.issues,
    );
  }

  const { userId } = await requireEventManager("/admin/integrations/ymhub");
  const admin = getPhaseOneAdminClient();
  const fileMetadata = parsed.datasets.map((dataset) => ({
    dataset: dataset.dataset,
    file_name: dataset.fileName,
    sha256: dataset.sha256,
    row_count: dataset.rowCount,
    exception_count: parsed.issues.filter(
      (item) => item.dataset === dataset.dataset && item.severity !== "error",
    ).length,
  }));

  const { data, error } = await admin.schema("core").rpc("apply_ymhub_import_batch", {
    p_period_start: periodStart,
    p_period_end: periodEnd,
    p_created_by: userId,
    p_template_version: ymHubImportTemplateVersion,
    p_files: fileMetadata,
    p_person_accounts: parsed.personAccounts,
    p_activities: parsed.activities,
    p_shifts: parsed.shifts,
    p_assignments: parsed.assignments,
    p_issues: parsed.issues,
  });

  if (error) {
    console.error("Unable to commit YM Hub import batch", {
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    if (error.code === "23505" || /already been imported/i.test(error.message ?? "")) {
      return errorState("One or more of these Salesforce report files have already been imported. No duplicate batch was created.");
    }
    return errorState(`The validated batch could not be committed. Diagnostic: YMHUB_IMPORT_${error.code ?? "UNKNOWN"}`);
  }

  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const batchId = typeof result.batch_id === "string" ? result.batch_id : undefined;
  revalidatePath("/admin/integrations/ymhub");
  revalidatePath("/admin/events");

  return {
    status: "success",
    message: "YM Hub batch committed. The four report files were applied as one atomic import.",
    datasets: parsed.datasets,
    issues: parsed.issues,
    ...(batchId ? { batchId } : {}),
  };
}
