import { describe, expect, it } from "vitest";
import { EDITABLE_SEO_PAGES, findEditableSeoPage } from "@/lib/seo";

describe("editable public SEO pages", () => {
  it("only allows the eight curated public routes", () => {
    expect(EDITABLE_SEO_PAGES).toHaveLength(8);
    expect(findEditableSeoPage("/")).toBeDefined();
    expect(findEditableSeoPage("/admin")).toBeUndefined();
    expect(findEditableSeoPage("/login")).toBeUndefined();
    expect(findEditableSeoPage("/opportunities/private-slug")).toBeUndefined();
  });
});
