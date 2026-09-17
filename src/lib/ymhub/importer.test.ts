import { describe, expect, it } from "vitest";
import { parseCsv, parseYmHubImportFiles, type YmHubImportFiles } from "./importer";

function file(fileName: string, text: string) {
  return { fileName, sha256: "a".repeat(64), text };
}

function validFiles(): YmHubImportFiles {
  return {
    person_accounts: file(
      "people.csv",
      `Account ID,Account Name,Email,Mobile,Total Volunteer Hours (Past 12 Months),Total Volunteer Hours (Past 24 Months)\n0018500000SNxTyAAL,Volunteer 1,vol1@example.test,81111111,10,12`,
    ),
    volunteer_initiatives: file(
      "initiatives.csv",
      `Volunteer Initiative ID,Volunteer Initiative Name,Is Ad Hoc,Start Date,End Date,Status\n1RV8500000000HlGAI,Packing,1,2026-09-15,2026-09-15,Upcoming`,
    ),
    job_position_shifts: file(
      "shifts.csv",
      `Job Position Shift ID,Related Volunteer Initiative,Job Position Name,Start Date,Start Time,End Date,End Time\n1Qy85000000032jCAA,1RV8500000000HlGAI,Packing Staff,2026-09-15,09:00,2026-09-15,11:00`,
    ),
    job_position_assignments: file(
      "assignments.csv",
      `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HlGAI,1Qy85000000032jCAA,Approved,2`,
    ),
  };
}

describe("YM Hub CSV importer", () => {
  it("parses quoted commas and escaped quotes", () => {
    expect(parseCsv('a,b\n"A, B","He said ""hi"""')).toEqual([
      ["a", "b"],
      ["A, B", 'He said "hi"'],
    ]);
  });

  it("accepts the verified four-report contract and preserves raw status", () => {
    const parsed = parseYmHubImportFiles(validFiles());
    expect(parsed.valid).toBe(true);
    expect(parsed.personAccounts).toHaveLength(1);
    expect(parsed.activities[0]?.is_ad_hoc).toBe(true);
    expect(parsed.shifts[0]?.starts_at).toBe("2026-09-15T09:00:00+08:00");
    expect(parsed.assignments[0]?.source_status).toBe("Approved");
  });

  it("accepts harmless extra Initiative columns", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      volunteer_initiatives: file(
        "initiatives.csv",
        `Volunteer Initiative ID,Volunteer Initiative Name,Is Ad Hoc,Start Date,End Date,Status,Description,Venue,Registration URL,Image URL\n1RV8500000000HlGAI,Packing,1,2026-09-15,2026-09-15,Upcoming,Pack items,Test Hall,https://example.test/register,https://example.test/image.jpg`,
      ),
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.activities[0]?.description).toBe("Pack items");
  });

  it("blocks a missing required header", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      person_accounts: file("people.csv", "Wrong Header\nvalue"),
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some(({ code }) => code === "MISSING_HEADER")).toBe(true);
  });

  it("blocks a shift/activity mismatch", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      volunteer_initiatives: file(
        "initiatives.csv",
        `Volunteer Initiative ID,Volunteer Initiative Name,Is Ad Hoc,Start Date,End Date,Status\n1RV8500000000HlGAI,Packing,1,2026-09-15,2026-09-15,Upcoming\n1RV8500000000HmGAI,Other,0,2026-09-15,2026-09-15,Upcoming`,
      ),
      job_position_assignments: file(
        "assignments.csv",
        `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HmGAI,1Qy85000000032jCAA,Approved,2`,
      ),
    });
    expect(parsed.valid).toBe(false);
    expect(parsed.issues.some(({ code }) => code === "SHIFT_ACTIVITY_MISMATCH")).toBe(true);
  });

  it("retains full-history assignments outside the published Initiative and Shift files", () => {
    const files = validFiles();
    const parsed = parseYmHubImportFiles({
      ...files,
      job_position_assignments: file(
        "assignments.csv",
        `Job Position Assignment ID,Assigned Account,Related Volunteer Initiative,Assigned Position Shift,Status,Actual Duration\n1Su8500000003cDCAQ,0018500000SNxTyAAL,1RV8500000000HlGAI,1Qy85000000032jCAA,Approved,2\n1Su8500000000JNCAY,0018500000SNxUzAAL,1RV8500000000HnGAI,1Qy85000000033jCAA,Rejected,`,
      ),
    });
    expect(parsed.valid).toBe(true);
    expect(parsed.assignments).toHaveLength(2);
    expect(
      parsed.issues.some(
        ({ code, severity }) =>
          code === "ASSIGNMENT_VOLUNTEER_NOT_IN_BATCH" && severity === "warning",
      ),
    ).toBe(true);
    expect(
      parsed.issues.some(
        ({ code, severity }) =>
          code === "ASSIGNMENT_SHIFT_NOT_IN_BATCH" && severity === "warning",
      ),
    ).toBe(true);
  });
});
