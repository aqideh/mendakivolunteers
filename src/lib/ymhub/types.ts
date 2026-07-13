export type YmHubVolunteer = Readonly<{
  externalVolunteerId: string;
  status: string;
  sourceUpdatedAt: string;
}>;

export type YmHubHealth = Readonly<{
  ok: boolean;
  connector: "mock" | "salesforce";
  checkedAt: string;
  detail?: string;
}>;

export interface YmHubGateway {
  getVolunteerByExternalId(
    externalVolunteerId: string,
  ): Promise<YmHubVolunteer | null>;
  listVolunteersUpdatedSince(since: Date): Promise<YmHubVolunteer[]>;
  healthCheck(): Promise<YmHubHealth>;
}
