import { describe, expect, it } from "vitest";

import { isUuid, readRequiredUuid } from "@/lib/content/identifiers";

describe("content identifiers", () => {
  it("accepts canonical UUID values", () => {
    expect(isUuid("20000000-0000-4000-8000-000000000001")).toBe(true);
  });

  it("rejects malformed route identifiers", () => {
    expect(isUuid("../../published-content")).toBe(false);
    expect(isUuid("not-a-uuid")).toBe(false);
  });

  it("reads a required UUID from form data", () => {
    const formData = new FormData();
    formData.set("id", "30000000-0000-4000-8000-000000000001");

    expect(readRequiredUuid(formData, "id")).toBe(
      "30000000-0000-4000-8000-000000000001",
    );
  });

  it("rejects an invalid form identifier", () => {
    const formData = new FormData();
    formData.set("id", "invalid");

    expect(() => readRequiredUuid(formData, "id")).toThrow(
      "Invalid id identifier.",
    );
  });
});
