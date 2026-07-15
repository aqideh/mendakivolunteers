import { describe, expect, it } from "vitest";

import { getSafeRedirectPath } from "@/lib/security/redirects";

describe("getSafeRedirectPath", () => {
  it("accepts an internal path", () => {
    expect(getSafeRedirectPath("/dashboard?tab=hours")).toBe(
      "/dashboard?tab=hours",
    );
  });

  it.each([
    "https://attacker.example",
    "//attacker.example",
    "\\attacker.example",
    "javascript:alert(1)",
  ])("rejects unsafe redirects: %s", (candidate) => {
    expect(getSafeRedirectPath(candidate)).toBe("/dashboard");
  });

  it("uses the caller's safe default path", () => {
    expect(getSafeRedirectPath(null, "/login")).toBe("/login");
  });
});
