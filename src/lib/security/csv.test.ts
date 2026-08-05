import { describe, expect, it } from "vitest";

import { csvCell, neutralizeSpreadsheetFormula } from "@/lib/security/csv";

describe("neutralizeSpreadsheetFormula", () => {
  it.each(["=1+1", "+SUM(A1:A2)", "-2+3", "@SUM(A1:A2)", "\t=1+1", "\r=1+1", "  =1+1"])(
    "neutralizes spreadsheet formulas: %s",
    (value) => {
      expect(neutralizeSpreadsheetFormula(value)).toBe(`'${value}`);
    },
  );

  it.each(["Aiman", "61234567", "user@example.com", "", " normal text"])(
    "leaves ordinary values unchanged: %s",
    (value) => {
      expect(neutralizeSpreadsheetFormula(value)).toBe(value);
    },
  );
});

describe("csvCell", () => {
  it("escapes quotes and neutralizes formulas", () => {
    expect(csvCell('=HYPERLINK("https://example.com")')).toBe(
      '"\'=HYPERLINK(""https://example.com"")"',
    );
  });

  it("renders nullish values as empty cells", () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });
});
