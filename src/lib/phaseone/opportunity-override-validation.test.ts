import { describe, expect, it } from "vitest";

import { opportunityOverrideSchema } from "@/lib/phaseone/opportunity-override-validation";

describe("opportunity override validation", () => {
  it("accepts empty fields as inherited values", () => {
    const result = opportunityOverrideSchema.safeParse({
      title: "",
      summary: "",
      imageUrl: "",
      startsAt: "",
      endsAt: "",
      scheduleText: "",
      venue: "",
      isVisible: true,
      sortOrder: "",
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.title).toBeNull();
      expect(result.data.sortOrder).toBeNull();
    }
  });

  it("rejects non-HTTPS image URLs and invalid sort order", () => {
    expect(
      opportunityOverrideSchema.safeParse({
        title: "",
        summary: "",
        imageUrl: "http://example.com/image.jpg",
        startsAt: "",
        endsAt: "",
        scheduleText: "",
        venue: "",
        isVisible: true,
        sortOrder: "10000",
      }).success,
    ).toBe(false);
  });
});
