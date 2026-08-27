import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

describe("roster server action module", () => {
  it("does not export non-function runtime values from a use server file", () => {
    const sourcePath = fileURLToPath(new URL("./roster-actions.ts", import.meta.url));
    const source = readFileSync(sourcePath, "utf8");

    expect(source).toMatch(/^"use server";/);
    expect(source).not.toMatch(/export\s+(?:const|let|var|class)\s+/);
    expect(source).toMatch(/export\s+async\s+function\s+importRosterWithDiagnostics\s*\(/);
  });
});
