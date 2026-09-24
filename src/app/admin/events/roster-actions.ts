"use server";

import { revalidatePath } from "next/cache";

import { requireEventManager } from "@/lib/auth/event-access";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import {
  getPhaseOneValidationMessage,
  rosterImportSchema,
} from "@/lib/phaseone/event-validation";

export type RosterImportState = Readonly<{
  status: "idle" | "success" | "error";
  message: string;
  diagnosticCode?: string;
}>;

function rosterImportError(
  message: string,
  diagnosticCode: string,
): RosterImportState {
  return { status: "error", message, diagnosticCode };
}

function databaseDiagnostic(error: {
  code?: string;
  message?: string;
}): RosterImportState {
  const message = error.message ?? "";

  if (error.code === "42501" || /permission denied/i.test(message)) {
    return rosterImportError(
      "The server blocked the roster import because of a permissions problem. No roster rows were changed. Contact the app administrator if this persists.",
      "ROSTER_PERMISSION",
    );
  }
  if (/attendance records cannot be replaced|roster with attendance records cannot be replaced/i.test(message)) {
    return rosterImportError(
      "This roster cannot be replaced because attendance records already exist. Choose Merge instead.",
      "ROSTER_REPLACE_HAS_ATTENDANCE",
    );
  }
  if (/duplicate volunteer identifiers|duplicate volunteer identities/i.test(message)) {
    return rosterImportError(
      "Two or more rows identify the same volunteer within the same shift. Check repeated Volunteer IDs, email addresses, contact numbers, or duplicate name-only rows.",
      "ROSTER_DUPLICATE_IDENTITY",
    );
  }
  if (/match multiple roster records|more specific identifier/i.test(message)) {
    return rosterImportError(
      "A volunteer matches more than one existing roster record. Add or correct a unique Volunteer ID, email address, or contact number for that row.",
      "ROSTER_AMBIGUOUS_MATCH",
    );
  }
  if (/integrated roster rows need/i.test(message)) {
    return rosterImportError(
      "Integrated roster rows need an existing KELUARGA Volunteer ID, email address, or mobile number. Name-only rows can only be kept as isolated event records.",
      "ROSTER_INTEGRATION_IDENTIFIER_REQUIRED",
    );
  }
  if (/KELUARGA volunteer ID does not exist/i.test(message)) {
    return rosterImportError(
      "A KELUARGA Volunteer ID in the CSV does not exist. Correct the ID, or remove it and provide a reliable email or mobile number so a new volunteer record can be created.",
      "ROSTER_KEL_ID_NOT_FOUND",
    );
  }
  if (/point to different KELUARGA volunteers|match multiple KELUARGA volunteer records/i.test(message)) {
    return rosterImportError(
      "The supplied KELUARGA ID, email or mobile number does not resolve to one unambiguous volunteer. Correct the identifiers before importing.",
      "ROSTER_KEL_IDENTITY_CONFLICT",
    );
  }
  if (/volunteer id conflicts/i.test(message)) {
    return rosterImportError(
      "A row contains a Volunteer ID that conflicts with an existing volunteer matched by email or contact number. Check that the identifiers belong to the same person.",
      "ROSTER_IDENTIFIER_CONFLICT",
    );
  }
  if (/blank timeslot or volunteer name/i.test(message)) {
    return rosterImportError(
      "At least one submitted row is missing a volunteer name or shift assignment. Re-preview the roster and correct the highlighted row.",
      "ROSTER_REQUIRED_FIELD",
    );
  }
  if (/shift that does not belong to this event/i.test(message)) {
    return rosterImportError(
      "At least one row points to a shift that is not part of this event. Download a fresh roster template and keep its date, shift and timeslot_id values unchanged.",
      "ROSTER_INVALID_SHIFT",
    );
  }
  if (error.code === "23505") {
    return rosterImportError(
      "The database found a duplicate volunteer assignment in the same shift. Check Volunteer ID, email and contact number for duplicates.",
      "ROSTER_DATABASE_DUPLICATE",
    );
  }
  if (error.code === "23503") {
    return rosterImportError(
      "The roster references an event, shift or staff record that no longer exists. Refresh the page and download a fresh template before retrying.",
      "ROSTER_DATABASE_REFERENCE",
    );
  }

  return rosterImportError(
    "The roster reached the server but could not be imported. No changes were confirmed. Re-preview the data and retry; if it still fails, report the diagnostic code below.",
    `ROSTER_DB_${error.code ?? "UNKNOWN"}`,
  );
}

export async function importRosterWithDiagnostics(
  formData: FormData,
): Promise<RosterImportState> {
  const eventId = String(formData.get("eventId") ?? "");
  let rows: unknown = null;

  try {
    rows = JSON.parse(String(formData.get("rows") ?? "null"));
  } catch {
    return rosterImportError(
      "Roster data could not be read. Preview the pasted rows or CSV again before importing.",
      "ROSTER_INVALID_JSON",
    );
  }

  const parsed = rosterImportSchema.safeParse({
    eventId,
    mode: formData.get("mode"),
    fileName: formData.get("fileName"),
    rows,
  });

  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    const rowIndex = issue?.path[0] === "rows" && typeof issue.path[1] === "number"
      ? issue.path[1] + 2
      : null;
    return rosterImportError(
      `${rowIndex ? `Row ${rowIndex}: ` : ""}${getPhaseOneValidationMessage(parsed.error)}`,
      "ROSTER_VALIDATION",
    );
  }

  const { userId } = await requireEventManager(`/admin/events/${eventId}/edit`);
  const admin = getPhaseOneAdminClient();
  const eventResult = await admin
    .from("phaseone_events")
    .select("operations_scope")
    .eq("id", parsed.data.eventId)
    .maybeSingle();

  if (eventResult.error || !eventResult.data) {
    return rosterImportError(
      "The event data boundary could not be checked. No roster rows were changed.",
      "ROSTER_EVENT_SCOPE_UNAVAILABLE",
    );
  }

  const operationsScope = String(eventResult.data.operations_scope);
  const isManual = operationsScope === "manual_isolated" || operationsScope === "manual_integrated";
  const integratesVolunteers = operationsScope === "manual_integrated";

  if (
    integratesVolunteers &&
    parsed.data.rows.some((row) => {
      const key = row.volunteer_key?.trim().toUpperCase() ?? "";
      return !/^KEL[0-9]{5}$/.test(key) && !row.email && !row.mobile;
    })
  ) {
    return rosterImportError(
      "Integrated manual events require an existing KELUARGA Volunteer ID, email address, or mobile number for every volunteer. Use an isolated manual event if the roster must remain name-only.",
      "ROSTER_INTEGRATION_IDENTIFIER_REQUIRED",
    );
  }

  const rpcName = isManual
    ? "phaseone_apply_manual_roster_import"
    : "phaseone_apply_roster_import";
  const rpcArgs = isManual
    ? {
        p_event_id: parsed.data.eventId,
        p_mode: parsed.data.mode,
        p_file_name: parsed.data.fileName,
        p_rows: parsed.data.rows,
        p_uploaded_by: userId,
        p_integrate_volunteers: integratesVolunteers,
      }
    : {
        p_event_id: parsed.data.eventId,
        p_mode: parsed.data.mode,
        p_file_name: parsed.data.fileName,
        p_rows: parsed.data.rows,
        p_uploaded_by: userId,
      };
  const { data, error } = await admin.rpc(rpcName, rpcArgs);

  if (error) {
    console.error("Unable to import phase-one roster", {
      code: error.code,
      details: error.details,
      hint: error.hint,
      eventId,
    });
    return databaseDiagnostic(error);
  }

  revalidatePath(`/admin/events/${eventId}/edit`);
  const result = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  const rowCount = typeof result.row_count === "number"
    ? result.row_count
    : parsed.data.rows.length;

  const linkedCount =
    typeof result.linked_volunteer_count === "number"
      ? result.linked_volunteer_count
      : 0;
  const createdCount =
    typeof result.created_volunteer_count === "number"
      ? result.created_volunteer_count
      : 0;
  const message =
    operationsScope === "manual_integrated"
      ? `${rowCount} assignment${rowCount === 1 ? "" : "s"} imported. ${linkedCount} KELUARGA volunteer${linkedCount === 1 ? "" : "s"} linked, including ${createdCount} new volunteer record${createdCount === 1 ? "" : "s"}.`
      : operationsScope === "manual_isolated"
        ? `${rowCount} event-only volunteer assignment${rowCount === 1 ? "" : "s"} imported. No main volunteer records were created or changed.`
        : `${rowCount} volunteer assignment${rowCount === 1 ? "" : "s"} imported successfully.`;

  return {
    status: "success",
    message,
  };
}
