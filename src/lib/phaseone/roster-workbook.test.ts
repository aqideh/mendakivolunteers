import { describe, expect, it } from "vitest";
import { inflateRawSync } from "node:zlib";

import { createProgrammeRosterWorkbook } from "./roster-workbook";

function unpack(buffer: Buffer): Map<string, string> {
  const entries = new Map<string, string>();
  let position = 0;
  while (buffer.readUInt32LE(position) === 0x04034b50) {
    const method = buffer.readUInt16LE(position + 8);
    const compressedSize = buffer.readUInt32LE(position + 18);
    const nameLength = buffer.readUInt16LE(position + 26);
    const extraLength = buffer.readUInt16LE(position + 28);
    const name = buffer.subarray(position + 30, position + 30 + nameLength).toString("utf8");
    const start = position + 30 + nameLength + extraLength;
    const compressed = buffer.subarray(start, start + compressedSize);
    const content = method === 8 ? inflateRawSync(compressed) : compressed;
    entries.set(name, content.toString("utf8"));
    position = start + compressedSize;
  }
  return entries;
}

describe("programme roster Excel workbook", () => {
  const input = {
    title: "Community Day <2026>",
    venue: "Tampines",
    generatedAt: "09 Oct 2026 15:40",
    shifts: [
      {
        label: "Morning",
        date: "09 Oct 2026",
        time: "09:00–12:00",
        volunteers: [
          {
            name: '=HYPERLINK("https://example.com","name")',
            contactNumber: "+65 9123 4567",
            email: "volunteer@example.com",
            dateOfBirth: "2003-02-09",
            tshirtSize: "M",
            dietaryRestrictions: "Vegetarian; allergies: peanuts",
            status: "Not arrived",
          },
        ],
      },
      {
        label: "Afternoon",
        date: "09 Oct 2026",
        time: "13:00–16:00",
        volunteers: [],
      },
    ],
  } as const;

  it("creates genuine XLSX files with correctly named multi-shift worksheets", () => {
    const entries = unpack(createProgrammeRosterWorkbook(input));
    expect(entries.has("[Content_Types].xml")).toBe(true);
    expect(entries.has("xl/workbook.xml")).toBe(true);
    expect(entries.has("xl/styles.xml")).toBe(true);
    expect(entries.has("xl/worksheets/sheet1.xml")).toBe(true);
    expect(entries.has("xl/worksheets/sheet2.xml")).toBe(true);
    expect(entries.get("xl/workbook.xml")).toContain('name="09 Oct 2026 Morning"');
  });

  it("preserves phone text and safe literal spreadsheet input without evaluating formulas", () => {
    const entries = unpack(createProgrammeRosterWorkbook(input));
    const sheet = entries.get("xl/worksheets/sheet1.xml") ?? "";
    expect(sheet).toContain('t="inlineStr"');
    expect(sheet).toContain("=HYPERLINK(&quot;https://example.com&quot;,&quot;name&quot;)");
    expect(sheet).not.toContain("<f>");
    expect(sheet).toContain("+65 9123 4567");
    expect(sheet).toContain("Vegetarian; allergies: peanuts");
    expect(sheet).toContain("2003-02-09");
    expect(sheet).toContain("CONFIDENTIAL");
  });

  it("freezes the top section, repeats print headers, and configures A4 landscape", () => {
    const entries = unpack(createProgrammeRosterWorkbook(input));
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain('orientation="landscape"');
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain('paperSize="9"');
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain('ySplit="6"');
    expect(entries.get("xl/workbook.xml")).toContain("_xlnm.Print_Titles");
    expect(entries.get("xl/worksheets/sheet2.xml")).toContain('dimension ref="A1:H11"');
  });

  it("orders worksheet XML elements as required by desktop Excel", () => {
    const entries = unpack(createProgrammeRosterWorkbook(input));
    const sheet = entries.get("xl/worksheets/sheet1.xml") ?? "";
    const filterIndex = sheet.indexOf("<autoFilter ");
    const mergeIndex = sheet.indexOf("<mergeCells ");
    const optionsIndex = sheet.indexOf("<printOptions ");
    expect(filterIndex).toBeGreaterThan(sheet.indexOf("</sheetData>"));
    expect(mergeIndex).toBeGreaterThan(filterIndex);
    expect(optionsIndex).toBeGreaterThan(mergeIndex);
    expect(sheet).toContain("volunteer@example.com");
    expect(sheet).toContain("Vegetarian; allergies: peanuts");
  });

  it("makes an actually empty roster explicit without hiding existing assignments", () => {
    const entries = unpack(createProgrammeRosterWorkbook({
      ...input,
      shifts: [{ ...input.shifts[0], volunteers: [] }],
    }));
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("No volunteers assigned at time of export");
    const filled = unpack(createProgrammeRosterWorkbook(input));
    expect(filled.get("xl/worksheets/sheet1.xml")).not.toContain("No volunteers assigned at time of export");
  });

  it("returns a printable empty roster for events without shifts", () => {
    const entries = unpack(createProgrammeRosterWorkbook({ ...input, shifts: [] }));
    expect(entries.has("xl/worksheets/sheet1.xml")).toBe(true);
    expect(entries.get("xl/worksheets/sheet1.xml")).toContain("Unscheduled");
  });
});
