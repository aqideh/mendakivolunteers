import { describe, expect, it } from "vitest";

import { getCountUpDisplayValue } from "../../components/phaseone/count-up-stat";

describe("count-up statistic", () => {
  it("starts at zero and finishes at the supplied value", () => {
    expect(getCountUpDisplayValue(12, 0)).toBe(0);
    expect(getCountUpDisplayValue(12, 1)).toBe(12);
  });

  it("uses an eased intermediate value", () => {
    expect(getCountUpDisplayValue(100, 0.5)).toBe(88);
  });

  it("clamps progress outside the animation range", () => {
    expect(getCountUpDisplayValue(7, -1)).toBe(0);
    expect(getCountUpDisplayValue(7, 2)).toBe(7);
  });

  it("keeps zero-valued statistics at zero", () => {
    expect(getCountUpDisplayValue(0, 0.75)).toBe(0);
  });
});
