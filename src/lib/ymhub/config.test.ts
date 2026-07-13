import { describe, expect, it } from "vitest";

import { resolveYmHubConfig } from "@/lib/ymhub/config";

describe("resolveYmHubConfig", () => {
  it("allows the mock connector outside production", () => {
    expect(
      resolveYmHubConfig({
        APP_ENV: "development",
        YMHUB_CONNECTOR_MODE: "mock",
      }),
    ).toEqual({ appEnvironment: "development", mode: "mock" });
  });

  it("rejects the mock connector in production", () => {
    expect(() =>
      resolveYmHubConfig({
        APP_ENV: "production",
        YMHUB_CONNECTOR_MODE: "mock",
      }),
    ).toThrow("disabled in production");
  });

  it("rejects placeholder Salesforce mappings in production", () => {
    expect(() =>
      resolveYmHubConfig({
        APP_ENV: "production",
        YMHUB_CONNECTOR_MODE: "salesforce",
        YMHUB_BASE_URL: "https://example.my.salesforce.com",
        YMHUB_CLIENT_ID: "client-id",
        YMHUB_CLIENT_SECRET: "client-secret",
        YMHUB_VOLUNTEER_OBJECT_API: "[YMH_VOLUNTEER_OBJECT_API]",
        YMHUB_VOLUNTEER_ID_FIELD_API: "Volunteer_Id__c",
        YMHUB_VOLUNTEER_STATUS_FIELD_API: "Status__c",
        YMHUB_VOLUNTEER_UPDATED_AT_FIELD_API: "SystemModstamp",
      }),
    ).toThrow("placeholder value");
  });
});
