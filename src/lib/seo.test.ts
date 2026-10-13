import { describe, expect, it } from "vitest";

import { absoluteSiteUrl, hasUpcomingTimeslot, jsonLd, publicPageMetadata } from "./seo";

describe("public SEO metadata", () => {
  it("uses the production domain for canonical and sharing URLs", () => {
    const result = publicPageMetadata({
      title: "Volunteer as a Coach in Singapore",
      description: "Support students with MENDAKI.",
      path: "/volunteer/coach",
    });
    expect(result.alternates?.canonical).toBe("/volunteer/coach");
    expect(result.openGraph?.url).toBe(absoluteSiteUrl("/volunteer/coach"));
    expect(result.twitter?.card).toBe("summary_large_image");
  });

  it("escapes HTML-breaking characters in JSON-LD", () => {
    expect(jsonLd({ title: "</script><script>alert(1)</script>" })).not.toContain("</script>");
    expect(jsonLd({ title: "test" })).toContain("test");
  });

  it("only selects future opportunity slots", () => {
    const now = new Date("2026-10-13T00:00:00.000Z");
    expect(hasUpcomingTimeslot([{ starts_at: "2026-10-10T00:00:00Z", ends_at: null }], now)).toBe(false);
    expect(hasUpcomingTimeslot([{ starts_at: "2026-10-17T00:00:00Z", ends_at: null }], now)).toBe(true);
    expect(hasUpcomingTimeslot([{ starts_at: "2026-10-12T00:00:00Z", ends_at: "2026-10-14T00:00:00Z" }], now)).toBe(true);
    expect(hasUpcomingTimeslot([], now)).toBe(false);
  });
});
