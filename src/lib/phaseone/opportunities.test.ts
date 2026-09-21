import { describe, expect, it } from "vitest";

import {
  mergeOpportunityOverrides,
  type PhaseOneOpportunity,
} from "@/lib/phaseone/opportunities";

const base: PhaseOneOpportunity[] = [
  {
    id: "11111111-1111-4111-8111-111111111111",
    title: "Imported A",
    summary: "Summary A",
    image_url: "https://example.com/a.jpg",
    starts_at: "2026-10-02T01:00:00.000Z",
    ends_at: "2026-10-02T05:00:00.000Z",
    schedule_text: "9 AM - 1 PM",
    venue: "Venue A",
    source_url: "https://www.volunteer.gov.sg/opportunity/a",
    imported_at: "2026-09-21T00:00:00.000Z",
  },
  {
    id: "22222222-2222-4222-8222-222222222222",
    title: "Imported B",
    summary: "Summary B",
    image_url: null,
    starts_at: "2026-10-01T01:00:00.000Z",
    ends_at: null,
    schedule_text: null,
    venue: "Venue B",
    source_url: "https://www.volunteer.gov.sg/opportunity/b",
    imported_at: "2026-09-21T00:00:00.000Z",
  },
];

describe("opportunity card overrides", () => {
  it("falls back to imported values for null override fields", () => {
    const result = mergeOpportunityOverrides(base, [
      {
        external_opportunity_id: base[0].id,
        title: "Manual title",
        summary: null,
        image_url: null,
        starts_at: null,
        ends_at: null,
        schedule_text: null,
        venue: null,
        is_visible: true,
        sort_order: null,
      },
    ]);

    expect(result[0]).toMatchObject({
      title: "Manual title",
      summary: "Summary A",
      venue: "Venue A",
    });
  });

  it("hides cards and puts explicitly ordered cards first", () => {
    const result = mergeOpportunityOverrides(base, [
      {
        external_opportunity_id: base[0].id,
        title: null,
        summary: null,
        image_url: null,
        starts_at: null,
        ends_at: null,
        schedule_text: null,
        venue: null,
        is_visible: false,
        sort_order: null,
      },
      {
        external_opportunity_id: base[1].id,
        title: null,
        summary: null,
        image_url: null,
        starts_at: null,
        ends_at: null,
        schedule_text: null,
        venue: null,
        is_visible: true,
        sort_order: 1,
      },
    ]);

    expect(result.map((item) => item.id)).toEqual([base[1].id]);
  });
});
