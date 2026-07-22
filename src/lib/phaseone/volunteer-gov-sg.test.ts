import { describe, expect, it } from "vitest";

import { parseVolunteerGovSgListings } from "./volunteer-gov-sg";

describe("parseVolunteerGovSgListings", () => {
  it("extracts and normalises structured opportunity data", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@context": "https://schema.org",
          "@type": "Event",
          "name": "MENDAKI Community Volunteer Day",
          "description": "Support community outreach.",
          "image": "/images/opportunity.jpg",
          "startDate": "2026-07-25T09:00:00+08:00",
          "endDate": "2026-07-25T13:00:00+08:00",
          "location": {
            "name": "MENDAKI",
            "address": {
              "streetAddress": "51 Kee Sun Avenue",
              "addressLocality": "Singapore",
              "postalCode": "457056"
            }
          },
          "url": "https://volunteer.gov.sg/volunteer/opportunity/details/example"
        }
      </script>
    `;

    const result = parseVolunteerGovSgListings(
      html,
      new Date("2026-07-22T01:00:00.000Z"),
    );

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "MENDAKI Community Volunteer Day",
      summary: "Support community outreach.",
      image_url: "https://volunteer.gov.sg/images/opportunity.jpg",
      starts_at: "2026-07-25T01:00:00.000Z",
      ends_at: "2026-07-25T05:00:00.000Z",
      venue: "MENDAKI · 51 Kee Sun Avenue, Singapore, 457056",
      source_url:
        "https://volunteer.gov.sg/volunteer/opportunity/details/example",
      imported_at: "2026-07-22T01:00:00.000Z",
      is_active: true,
    });
  });

  it("rejects non-event records and off-domain URLs", () => {
    const html = `
      <script type="application/ld+json">
        [
          {"@type":"Organization","name":"MENDAKI","url":"https://volunteer.gov.sg"},
          {"@type":"Event","name":"Unsafe","url":"https://example.com/event"}
        ]
      </script>
    `;

    expect(parseVolunteerGovSgListings(html)).toEqual([]);
  });
});
