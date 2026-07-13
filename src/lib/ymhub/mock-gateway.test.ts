import { describe, expect, it } from "vitest";

import { MockYmHubGateway } from "@/lib/ymhub/mock-gateway";

describe("MockYmHubGateway", () => {
  it("returns a volunteer by the prototype external ID", async () => {
    const gateway = new MockYmHubGateway();

    await expect(
      gateway.getVolunteerByExternalId("PROTO-VOL-000001"),
    ).resolves.toMatchObject({
      externalVolunteerId: "PROTO-VOL-000001",
      status: "PROTO_VERIFIED",
    });
  });

  it("returns null for an unknown volunteer", async () => {
    const gateway = new MockYmHubGateway();
    await expect(
      gateway.getVolunteerByExternalId("PROTO-VOL-999999"),
    ).resolves.toBeNull();
  });

  it("filters incremental updates by timestamp", async () => {
    const gateway = new MockYmHubGateway();
    const records = await gateway.listVolunteersUpdatedSince(
      new Date("2026-07-06T00:00:00.000Z"),
    );

    expect(records.map((record) => record.externalVolunteerId)).toEqual([
      "PROTO-VOL-000003",
    ]);
  });

  it("rejects an invalid timestamp", async () => {
    const gateway = new MockYmHubGateway();
    await expect(
      gateway.listVolunteersUpdatedSince(new Date("invalid")),
    ).rejects.toThrow("since must be a valid Date");
  });
});
