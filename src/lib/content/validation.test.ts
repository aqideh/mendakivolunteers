import { describe, expect, it } from "vitest";

import {
  newsInputSchema,
  opportunityInputSchema,
} from "@/lib/content/validation";

const validOpportunity = {
  slug: "community-learning-support",
  title: "Community Learning Support",
  summary: "Support learners during a community learning session.",
  body: "Volunteers will help facilitators, learners, and event operations during the session.",
  category: "Education",
  locationName: "MENDAKI premises",
  isRemote: false,
  startsAt: "2026-07-25T09:00",
  endsAt: "2026-07-25T13:00",
  registrationDeadline: "2026-07-22T23:59",
  registrationUrl: "https://example.invalid/ymhub/PROTO-ACT-000001",
  ymhubActivityId: "PROTO-ACT-000001",
  featured: true,
  status: "published",
  publishAt: "2026-07-10T08:00",
  expiresAt: "",
};

describe("opportunityInputSchema", () => {
  it("converts Singapore local timestamps to UTC ISO values", () => {
    const result = opportunityInputSchema.parse(validOpportunity);

    expect(result.startsAt).toBe("2026-07-25T01:00:00.000Z");
    expect(result.publishAt).toBe("2026-07-10T00:00:00.000Z");
  });

  it("requires HTTPS registration links", () => {
    const result = opportunityInputSchema.safeParse({
      ...validOpportunity,
      registrationUrl: "http://example.invalid/register",
    });

    expect(result.success).toBe(false);
  });

  it("rejects registration deadlines after the activity starts", () => {
    const result = opportunityInputSchema.safeParse({
      ...validOpportunity,
      registrationDeadline: "2026-07-26T09:00",
    });

    expect(result.success).toBe(false);
  });

  it("requires a publication time for scheduled content", () => {
    const result = opportunityInputSchema.safeParse({
      ...validOpportunity,
      status: "scheduled",
      publishAt: "",
    });

    expect(result.success).toBe(false);
  });
});

describe("newsInputSchema", () => {
  it("accepts a valid draft news post", () => {
    const result = newsInputSchema.safeParse({
      slug: "volunteer-portal-update",
      title: "Volunteer portal update",
      summary: "A brief update for volunteers using the portal.",
      body: "The volunteer portal now includes app-managed opportunity listings and news content.",
      featured: false,
      status: "draft",
      publishAt: "",
      expiresAt: "",
    });

    expect(result.success).toBe(true);
  });
});
