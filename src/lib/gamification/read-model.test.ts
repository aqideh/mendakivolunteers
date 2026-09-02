import { describe, expect, it } from "vitest";

import {
  describePointRule,
  formatPointDelta,
  formatPointEntryKind,
  formatPoints,
} from "@/lib/gamification/read-model";

describe("gamification read-model presentation", () => {
  it("formats whole and fractional point values", () => {
    expect(formatPoints(25)).toBe("25");
    expect(formatPoints(12.5)).toBe("12.50");
  });

  it("formats signed ledger deltas", () => {
    expect(formatPointDelta(10)).toBe("+10");
    expect(formatPointDelta(-2.5)).toBe("-2.50");
    expect(formatPointDelta(0)).toBe("0");
  });

  it("uses clear entry labels", () => {
    expect(formatPointEntryKind("award")).toBe("Points awarded");
    expect(formatPointEntryKind("adjustment")).toBe("Points adjusted");
    expect(formatPointEntryKind("reversal")).toBe("Points reversed");
  });

  it("describes supported rule calculations", () => {
    expect(describePointRule("flat", 15)).toBe(
      "15 points for each qualifying verified activity",
    );
    expect(describePointRule("per_verified_hour", 10)).toBe(
      "10 points for each verified volunteer hour",
    );
  });

  it("rejects invalid numeric values", () => {
    expect(() => formatPoints(Number.NaN)).toThrow(
      "Point value must be finite",
    );
    expect(() => formatPointDelta(Number.POSITIVE_INFINITY)).toThrow(
      "Point delta must be finite",
    );
  });
});
