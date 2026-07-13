import { MOCK_YMHUB_VOLUNTEERS } from "@/lib/ymhub/mock-data";
import type {
  YmHubGateway,
  YmHubHealth,
  YmHubVolunteer,
} from "@/lib/ymhub/types";

export class MockYmHubGateway implements YmHubGateway {
  private readonly volunteers: readonly YmHubVolunteer[];

  constructor(volunteers: readonly YmHubVolunteer[] = MOCK_YMHUB_VOLUNTEERS) {
    this.volunteers = volunteers.map((volunteer) => ({ ...volunteer }));
  }

  async getVolunteerByExternalId(
    externalVolunteerId: string,
  ): Promise<YmHubVolunteer | null> {
    const volunteer = this.volunteers.find(
      (candidate) => candidate.externalVolunteerId === externalVolunteerId,
    );

    return volunteer ? { ...volunteer } : null;
  }

  async listVolunteersUpdatedSince(since: Date): Promise<YmHubVolunteer[]> {
    if (Number.isNaN(since.getTime())) {
      throw new TypeError("since must be a valid Date");
    }

    return this.volunteers
      .filter(
        (volunteer) =>
          new Date(volunteer.sourceUpdatedAt).getTime() > since.getTime(),
      )
      .map((volunteer) => ({ ...volunteer }));
  }

  async healthCheck(): Promise<YmHubHealth> {
    return {
      ok: true,
      connector: "mock",
      checkedAt: new Date().toISOString(),
      detail: "Development-only YM Hub adapter",
    };
  }
}
