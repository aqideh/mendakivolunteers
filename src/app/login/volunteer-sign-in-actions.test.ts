import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  createEmailLinkClientMock,
  getPublicConfigMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  createEmailLinkClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

const backgroundTasks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/supabase/email-link", () => ({
  createEmailLinkClient: createEmailLinkClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(email: string, next = "/dashboard") {
  const data = new FormData();
  data.set("email", email);
  data.set("next", next);
  return data;
}

async function runBackgroundTask() {
  expect(afterMock).toHaveBeenCalledTimes(1);
  const task = backgroundTasks.shift();
  expect(task).toBeDefined();
  await task?.();
}

describe("volunteer email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backgroundTasks.length = 0;
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      backgroundTasks.push(callback);
    });
    createEmailLinkClientMock.mockReturnValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://mendakivolunteers.vercel.app",
    });
    signInWithOtpMock.mockResolvedValue({ error: null });
  });

  it("only exposes the async server action at runtime", () => {
    expect(Object.keys(volunteerSignInActions)).toEqual([
      "requestVolunteerSignInLink",
    ]);
    expect(
      volunteerSignInActions.requestVolunteerSignInLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("responds immediately, then sends a normalized email without creating a new volunteer account", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData(" New.Volunteer@Example.Test ", "/opportunities/community-day"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("If the email is linked to a Keluarga profile");
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    await runBackgroundTask();

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fopportunities%2Fcommunity-day",
      },
    });
  });

  it("rejects unsafe return destinations", async () => {
    await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test", "https://attacker.example/path"),
    );

    await runBackgroundTask();

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "volunteer@example.test",
      options: expect.objectContaining({
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm?next=%2Fdashboard",
      }),
    });
  });

  it("rejects an invalid email before scheduling Supabase delivery", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("keeps delivery failures non-disclosing while retaining diagnostics", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("If the email is linked to a Keluarga profile");
    expect(result.message).not.toContain("volunteer@example.test");

    await runBackgroundTask();

    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer magic-link request was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    );
  });

  it("reports missing public configuration without scheduling delivery", async () => {
    getPublicConfigMock.mockImplementation(() => {
      throw new Error("NEXT_PUBLIC_APP_URL missing");
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Volunteer sign-in is not configured in this environment.",
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });
});
