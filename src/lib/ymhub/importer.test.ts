import { describe, expect, it } from "vitest";
import { parseCsv, parseYmHubImportFiles, type YmHubImportFiles } from "./importer";

function file(fileName: string, text: string) { return { fileName, sha256: "a".repeat(64), text }; }

function validFiles(): YmHubImportFiles {
  return {
    person_accounts: file("people.csv", `Account ID,Account Name,Email,Mobile,Total Volunteer Hours (Past 12 Months),Total Volunteer Hours (Past 24 Months)\n0018500000SNxTyAAL,Volunteer 1,vol1@example.test,81111111,10,12`),
    volunteer_initiatives: file("initiatives.csv", `Volunteer Initiative ID,Volunteer Initiative Name,Is Ad Hoc,Start Date,End Date,Status\n1RV8500000000HlGAI,Packing,1,2026-09-15,2026-09-15,Upcoming`),
    job_position_shifts: file("shifts.csv", `Job Position Shift ID,Job Position: Related Volunteer Initiative: Volunteer Initiative ID,Job Position Name,Start Date & Time,End Date & Time\n1Qy85000000032jCAA,1RV8500000000HlGAI,Packing Staff,2026-09-15T09:00:00+08:00,2026-09-15T11:00:00+08:00`),
    job_position_assignments: file("assignments.csv", `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HlGAI,1Qy85000000032jCAA,Approved,2`),
  };
}

describe("YM Hub CSV importer", () => {
  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"A, B","He said ""hi"""')).toEqual([["a", "b"], ["A, B", 'He said "hi"']]);
  });

  it("accepts the verified four-report contract and preserves raw status", () => {
    const parsed = parseYmHubImportFiles(validFiles());
    expect(parsed.valid).toBe(true);
    expect(parsed.personAccounts).toHaveLength(1);
    expect(parsed.activities[0]?.is_ad_hoc).toBe(true);
    expect(parsed.assignments[0]?.source_status).toBe("Approved");
  });

  it("blocks a header mismatch", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({ ...files, person_accounts: file("people.csv", "Wrong Header\nvalue") });
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some(({ code }) => code === "CSV_HEADERS")).toBe(true);
  });

  it("requires Singapore offset timestamps for shift reports", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      job_position_shifts: file("shifts.csv", `Job Position Shift ID,Job Position: Related Volunteer Initiative: Volunteer Initiative ID,Job Position Name,Start Date & Time,End Date & Time\n1Qy85000000032jCAA,1RV8500000000HlGAI,Packing Staff,2026-09-15T09:00:00Z,2026-09-15T11:00:00Z`),
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some(({ code }) => code === "INVALID_TIMESTAMP")).toBe(true);
  });

  it("blocks a shift/activity mismatch", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      job_position_assignments: file("assignments.csv", `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HlGAI,UNKNOWN-SHIFT,Approved,2`),
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some(({ code }) => code === "UNKNOWN_SHIFT_REFERENCE")).toBe(true);
  });

  it("skips full-history assignments outside the published initiative scope without failing the batch", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      job_position_assignments: file("assignments.csv", `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HlGAI,1Qy85000000032jCAA,Approved,2\n1Su8500000000JNCAY,OTHER-ACCOUNT,OLD-UNPUBLISHED-ACTIVITY,,Rejected,`),
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.assignments).toHaveLength(1);
    expect(parsed.issues.some(({ code, severity }) => code === "ASSIGNMENTS_OUT_OF_SCOPE" && severity === "info")).toBe(true);
  });
});
