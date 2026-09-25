"use server";

import { createHash } from "node:crypto";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";

import { requireProgrammeManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  opportunityWorkbookMaxBytes,
  parseOpportunityWorkbook,
  toOpportunityImportPayload,
  type OpportunityWorkbookEvent,
  type OpportunityWorkbookIssue,
} from "@/lib/phaseone/opportunity-workbook";
import { createClient } from "@/lib/supabase/server";

export type OpportunityImportPreview = Readonly<{
  fileName: string;
  sha256: string;
  valid: boolean;
  alreadyImported: boolean;
  opportunityRows: number;
  shiftRows: number;
  events: OpportunityWorkbookEvent[];
  issues: OpportunityWorkbookIssue[];
}>;

export type OpportunityImportActionState = Readonly<{
  status: "idle" | "preview" | "success" | "error";
  message: string;
  preview?: OpportunityImportPreview;
  batchId?: string;
}>;

const initialError = (message: string): OpportunityImportActionState => ({
  status: "error",
  message,
});

function workbookFile(formData: FormData): File | null {
  const value = formData.get("workbook");
  return value instanceof File && value.size > 0 ? value : null;
}

function validateFile(file: File): string | null {
  const lowerName = file.name.toLowerCase();
  if (!lowerName.endsWith(".xlsx")) return "Upload the Keluarga .xlsx opportunity population template.";
  if (file.name.length > 255) return "The workbook file name is too long.";
  if (file.size > opportunityWorkbookMaxBytes) return "The workbook must be 8 MB or smaller.";
  return null;
}

async function inspectWorkbook(file: File): Promise<OpportunityImportPreview> {
  const bytes = await file.arrayBuffer();
  const sha256 = createHash("sha256").update(Buffer.from(bytes)).digest("hex");
  const parsed = parseOpportunityWorkbook(bytes);
  const admin = getPhaseOneAdminClient();

  const [existingSlugsResult, existingBatchResult] = await Promise.all([
    parsed.events.length
      ? admin
          .from("phaseone_events")
          .select("slug")
          .in("slug", parsed.events.map((event) => event.slug))
      : Promise.resolve({ data: [], error: null }),
    admin
      .from("phaseone_opportunity_imports")
      .select("id")
      .eq("file_sha256", sha256)
      .maybeSingle(),
  ]);

  const issues = [...parsed.issues];
  if (existingSlugsResult.error) {
    throw new Error("Existing Keluarga programmes could not be checked.");
  }
  if (existingBatchResult.error) {
    throw new Error("Previous imports could not be checked.");
  }

  const alreadyImported = Boolean(existingBatchResult.data);
  if (alreadyImported) {
    issues.push({
      severity: "warning",
      code: "WORKBOOK_ALREADY_IMPORTED",
      sheet: "Workbook",
      row: null,
      message: "This exact workbook has already been imported. Re-uploading it will not create duplicates.",
    });
  } else {
    const existingSlugs = new Set((existingSlugsResult.data ?? []).map((row) => row.slug));
    for (const event of parsed.events) {
      if (existingSlugs.has(event.slug)) {
        issues.push({
          severity: "error",
          code: "SLUG_ALREADY_EXISTS",
          sheet: "Opportunities",
          row: event.sourceRow,
          message: `Slug “${event.slug}” already exists in Keluarga. Change the workbook slug or edit the existing programme instead.`,
        });
      }
    }
  }

  return {
    fileName: file.name,
    sha256,
    valid: parsed.valid && !issues.some((issue) => issue.severity === "error") && !alreadyImported,
    alreadyImported,
    opportunityRows: parsed.opportunityRows,
    shiftRows: parsed.shiftRows,
    events: parsed.events,
    issues,
  };
}

export async function previewOpportunityWorkbook(
  _previous: OpportunityImportActionState,
  formData: FormData,
): Promise<OpportunityImportActionState> {
  await requireProgrammeManager("/admin/events/import");
  const file = workbookFile(formData);
  if (!file) return initialError("Select an XLSX workbook first.");

  const fileError = validateFile(file);
  if (fileError) return initialError(fileError);

  try {
    const preview = await inspectWorkbook(file);
    if (preview.alreadyImported) {
      return {
        status: "preview",
        message: "This exact workbook was imported previously. No new records will be created.",
        preview,
      };
    }
    return {
      status: "preview",
      message: preview.valid
        ? `Validation passed: ${preview.opportunityRows} opportunities and ${preview.shiftRows} shifts are ready to import as drafts.`
        : "Validation found blocking issues. Nothing has been imported.",
      preview,
    };
  } catch (error) {
    console.error("Unable to preview opportunity workbook", error);
    return initialError("The workbook could not be previewed. Confirm it is the Keluarga XLSX template and try again.");
  }
}

export async function commitOpportunityWorkbook(
  _previous: OpportunityImportActionState,
  formData: FormData,
): Promise<OpportunityImportActionState> {
  const { userId } = await requireProgrammeManager("/admin/events/import");
  const file = workbookFile(formData);
  if (!file) return initialError("Select an XLSX workbook first.");

  const fileError = validateFile(file);
  if (fileError) return initialError(fileError);

  try {
    const preview = await inspectWorkbook(file);
    if (preview.alreadyImported) {
      return {
        status: "success",
        message: "This exact workbook was already imported earlier. No duplicate programmes were created.",
        preview,
      };
    }
    if (!preview.valid) {
      return {
        status: "error",
        message: "The workbook changed or no longer passes validation. Review the issues and preview it again.",
        preview,
      };
    }

    const supabase = await createClient();
    const rpcClient = supabase as unknown as SupabaseClient;
    const { data, error } = await rpcClient.rpc("phaseone_import_opportunity_workbook", {
      p_file_name: preview.fileName,
      p_file_sha256: preview.sha256,
      p_uploaded_by: userId,
      p_events: toOpportunityImportPayload(preview.events),
    });

    if (error) {
      console.error("Unable to commit opportunity workbook", { code: error.code });
      return {
        status: "error",
        message: error.code === "23505"
          ? "An opportunity slug now conflicts with an existing Keluarga programme. Preview the workbook again before importing."
          : "The workbook could not be imported. No partial import was kept.",
        preview,
      };
    }

    const result = data as {
      status?: string;
      batch_id?: string;
      opportunity_count?: number;
      shift_count?: number;
    } | null;

    revalidatePath("/admin/events");
    revalidatePath("/admin/content");
    revalidatePath("/opportunities");
    revalidatePath("/journey");

    const success: OpportunityImportActionState = {
      status: "success",
      message: result?.status === "duplicate"
        ? "This exact workbook was already imported earlier. No duplicate programmes were created."
        : `Imported ${result?.opportunity_count ?? preview.opportunityRows} programme drafts and ${result?.shift_count ?? preview.shiftRows} shifts. Review each programme before publishing.`,
      preview,
      ...(result?.batch_id ? { batchId: result.batch_id } : {}),
    };
    return success;
  } catch (error) {
    console.error("Unable to commit opportunity workbook", error);
    return initialError("The workbook could not be imported. No partial import was kept.");
  }
}
