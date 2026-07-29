import { afterEach, describe, expect, it, vi } from "vitest";

import {
  fetchMendakiVolunteerGovSgListings,
  normaliseScheduleText,
  parseVolunteerGovSgAgencyListings,
  parseVolunteerGovSgListings,
} from "./volunteer-gov-sg";

const importedAt = new Date("2026-07-29T01:00:00.000Z");

const agencyListingHtml = `
  <div class="home-discover-opp">
    <a href="/volunteer/opportunity/details/?id=multi" class="announce-h4">
      <img class="img-fluid" src="/images/opportunity/multi.png">
      <label class="opp-thumb-slot-label">37 slots left</label>
    </a>
    <div class="caption">
      <span class="label-opp-name" title="RSL Maths Explorer Learning Buddy">
        RSL Maths Explorer Learning Buddy
      </span>
      <p><img src="/images/calendar.png"> 10/07/2026-31/12/2026</p>
      <p><img src="/images/time.png"> Multiple Shifts</p>
      <p title="Multiple Locations"><img src="/images/pin.png">Multiple Locations</p>
    </div>
  </div>
  <div class="home-discover-opp">
    <a href="/volunteer/opportunity/details/?id=placeholder" class="announce-h4">
      <img class="img-fluid" src="/images/opportunity/placeholder.png">
      <label class="opp-thumb-slot-label">1 slot left</label>
    </a>
    <div class="caption">
      <span class="label-opp-name" title="Volunteer Transport Minder">
        Volunteer Transport Minder
      </span>
      <p><img src="/images/calendar.png"> 07/05/2026-31/12/2026</p>
      <p><img src="/images/time.png"> 12:00 AM–12:00 AM</p>
      <p title="51 Kee Sun Avenue Wisma Mendaki Singapore 457056">
        <img src="/images/pin.png">51 Kee Sun Avenue
      </p>
    </div>
  </div>
  <div class="home-discover-opp">
    <a href="/volunteer/opportunity/details/?id=fixed" class="announce-h4">
      <img class="img-fluid" src="/images/opportunity/fixed.png">
      <label class="opp-thumb-slot-label">30 slots left</label>
    </a>
    <div class="caption">
      <span class="label-opp-name" title="SHG Joint Tuition Award">
        SHG Joint Tuition Award
      </span>
      <p><img src="/images/calendar.png"> 28/08/2026-04/09/2026</p>
      <p><img src="/images/time.png"> 07:00 AM - 07:00 PM</p>
      <p title="Republic Polytechnic"><img src="/images/pin.png">Republic Polytechnic</p>
    </div>
  </div>
`;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("normaliseScheduleText", () => {
  it("normalises multiple shifts and midnight placeholders", () => {
    expect(normaliseScheduleText("Multiple Shifts")).toBe("multiple shifts");
    expect(normaliseScheduleText("12:00 AM–12:00 AM")).toBe(
      "multiple timings",
    );
    expect(normaliseScheduleText("07:00 AM - 07:00 PM")).toBe(
      "07:00 AM - 07:00 PM",
    );
  });
});

describe("parseVolunteerGovSgAgencyListings", () => {
  it("extracts current and ongoing Sitefinity opportunity cards", () => {
    const result = parseVolunteerGovSgAgencyListings(
      agencyListingHtml,
      importedAt,
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({
      title: "RSL Maths Explorer Learning Buddy",
      summary: null,
      image_url:
        "https://www.volunteer.gov.sg/images/opportunity/multi.png",
      starts_at: "2026-07-09T16:00:00.000Z",
      ends_at: "2026-12-31T15:59:59.000Z",
      schedule_text: "multiple shifts",
      venue: "Multiple Locations",
      source_url:
        "https://www.volunteer.gov.sg/volunteer/opportunity/details/?id=multi",
      imported_at: "2026-07-29T01:00:00.000Z",
      is_active: true,
    });
    expect(result[1]).toMatchObject({
      title: "Volunteer Transport Minder",
      summary: null,
      schedule_text: "multiple timings",
      venue: "51 Kee Sun Avenue Wisma Mendaki Singapore 457056",
    });
    expect(result[2]).toMatchObject({
      title: "SHG Joint Tuition Award",
      starts_at: "2026-08-27T23:00:00.000Z",
      ends_at: "2026-09-04T11:00:00.000Z",
      schedule_text: "07:00 AM - 07:00 PM",
    });
    expect(result[0]?.raw_payload).toMatchObject({
      date_range: "10/07/2026-31/12/2026",
      schedule: "Multiple Shifts",
      availability: "37 slots left",
    });
  });

  it("rejects cards with off-domain opportunity URLs", () => {
    const unsafeHtml = agencyListingHtml.replace(
      "/volunteer/opportunity/details/?id=multi",
      "https://example.com/opportunity",
    );

    expect(
      parseVolunteerGovSgAgencyListings(unsafeHtml, importedAt),
    ).toHaveLength(2);
  });
});

describe("parseVolunteerGovSgListings", () => {
  it("keeps the legacy structured-data fallback without importing summaries", () => {
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
          "url": "https://www.volunteer.gov.sg/volunteer/opportunity/details/example"
        }
      </script>
    `;

    const result = parseVolunteerGovSgListings(html, importedAt);

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({
      title: "MENDAKI Community Volunteer Day",
      summary: null,
      image_url: "https://www.volunteer.gov.sg/images/opportunity.jpg",
      starts_at: "2026-07-25T01:00:00.000Z",
      ends_at: "2026-07-25T05:00:00.000Z",
      schedule_text: null,
      venue: "MENDAKI · 51 Kee Sun Avenue, Singapore, 457056",
      source_url:
        "https://www.volunteer.gov.sg/volunteer/opportunity/details/example",
      imported_at: "2026-07-29T01:00:00.000Z",
      is_active: true,
    });
  });

  it("accepts the bare Volunteer.gov.sg hostname", () => {
    const html = `
      <script type="application/ld+json">
        {
          "@type":"Event",
          "name":"Bare host event",
          "url":"https://volunteer.gov.sg/volunteer/opportunity/details/example"
        }
      </script>
    `;

    expect(parseVolunteerGovSgListings(html)).toHaveLength(1);
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

describe("fetchMendakiVolunteerGovSgListings", () => {
  it("loads the agency context and posts for the current opportunity cards", async () => {
    const agencyPage = `
      <form>
        <input name="__RequestVerificationToken" value="csrf-token">
        <input id="hdAgencyId" value="agency-id">
        <input id="hiddenAgencyDetailOpPageNo" value="3">
      </form>
    `;
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(agencyPage, {
          status: 200,
          headers: { "set-cookie": "antiforgery=cookie-value; Path=/; Secure" },
        }),
      )
      .mockResolvedValueOnce(new Response(agencyListingHtml, { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchMendakiVolunteerGovSgListings(
      "https://www.volunteer.gov.sg/volunteer/agencies/agency_details?code=MENDAKI",
    );

    expect(result).toHaveLength(3);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const [listingUrl, listingInit] = fetchMock.mock.calls[1] ?? [];
    expect(String(listingUrl)).toBe(
      "https://www.volunteer.gov.sg/Agency/GetOpportunityByAgency/",
    );
    expect(listingInit).toMatchObject({
      method: "POST",
      headers: expect.objectContaining({
        cookie: "antiforgery=cookie-value",
      }),
    });
    expect(String(listingInit?.body)).toContain("agencyID=agency-id");
    expect(String(listingInit?.body)).toContain("loadFor=UpComing");
    expect(String(listingInit?.body)).toContain("loadMore=True");
  });
});
