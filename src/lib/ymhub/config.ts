import { z } from "zod";

import {
  getAppEnvironment,
  type AppEnvironment,
  type Environment,
} from "@/lib/env";

const connectorModeSchema = z.enum(["mock", "salesforce"]);
const requiredText = z.string().trim().min(1);

export type YmHubConnectorConfig =
  | Readonly<{
      appEnvironment: AppEnvironment;
      mode: "mock";
    }>
  | Readonly<{
      appEnvironment: AppEnvironment;
      mode: "salesforce";
      baseUrl: string;
      clientId: string;
      clientSecret: string;
      volunteerObjectApiName: string;
      volunteerIdFieldApiName: string;
      volunteerStatusFieldApiName: string;
      volunteerUpdatedAtFieldApiName: string;
    }>;

function assertProductionMapping(value: string, name: string): string {
  if (/PROTO|PLACEHOLDER|\[[A-Z0-9_]+\]/i.test(value)) {
    throw new Error(`${name} contains a prototype or placeholder value`);
  }
  return value;
}

export function resolveYmHubConfig(
  environment: Environment = process.env,
): YmHubConnectorConfig {
  const appEnvironment = getAppEnvironment(environment);
  const mode = connectorModeSchema.parse(
    environment.YMHUB_CONNECTOR_MODE ?? "mock",
  );

  if (appEnvironment === "production" && mode === "mock") {
    throw new Error("The mock YM Hub connector is disabled in production");
  }

  if (mode === "mock") {
    return { appEnvironment, mode };
  }

  const values = {
    baseUrl: z.string().url().parse(environment.YMHUB_BASE_URL),
    clientId: requiredText.parse(environment.YMHUB_CLIENT_ID),
    clientSecret: requiredText.parse(environment.YMHUB_CLIENT_SECRET),
    volunteerObjectApiName: requiredText.parse(
      environment.YMHUB_VOLUNTEER_OBJECT_API,
    ),
    volunteerIdFieldApiName: requiredText.parse(
      environment.YMHUB_VOLUNTEER_ID_FIELD_API,
    ),
    volunteerStatusFieldApiName: requiredText.parse(
      environment.YMHUB_VOLUNTEER_STATUS_FIELD_API,
    ),
    volunteerUpdatedAtFieldApiName: requiredText.parse(
      environment.YMHUB_VOLUNTEER_UPDATED_AT_FIELD_API,
    ),
  };

  if (appEnvironment === "production") {
    for (const [name, value] of Object.entries(values)) {
      assertProductionMapping(value, name);
    }
  }

  return { appEnvironment, mode, ...values };
}
