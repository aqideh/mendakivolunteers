import { resolveYmHubConfig } from "@/lib/ymhub/config";
import { MockYmHubGateway } from "@/lib/ymhub/mock-gateway";
import type { YmHubGateway } from "@/lib/ymhub/types";

export function createYmHubGateway(): YmHubGateway {
  const config = resolveYmHubConfig();

  if (config.mode === "mock") {
    return new MockYmHubGateway();
  }

  throw new Error(
    "The Salesforce YM Hub gateway is not implemented in Phase 1. Do not deploy with salesforce mode yet.",
  );
}

export type { YmHubGateway, YmHubHealth, YmHubVolunteer } from "./types";
