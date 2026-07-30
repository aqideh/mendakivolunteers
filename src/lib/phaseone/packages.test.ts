import { describe, expect, it } from "vitest";

import { startOfSingaporeDayIso } from "./packages";

describe("startOfSingaporeDayIso", () => {
  it("keeps events from the current Singapore calendar day visible", () => {
    expect(startOfSingaporeDayIso(new Date("2026-07-30T02:17:00.000Z"))).toBe(
      "2026-07-29T16:00:00.000Z",
    );
  });

  it("uses the next Singapore day after local midnight", () => {
    expect(startOfSingaporeDayIso(new Date("2026-07-30T16:01:00.000Z"))).toBe(
      "2026-07-30T16:00:00.000Z",
    );
  });
});
