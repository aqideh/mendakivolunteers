import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  afterMock,
  createEmailLinkClientMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  afterMock: vi.fn(),
  createEmailLinkClientMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

const backgroundTasks: Array<() => void | Promise<void>> = [];

vi.mock("next/server", () => ({
  after: afterMock,
}));

vi.mock("@/lib/supabase/email-link", () => ({
  createEmailLinkClient: createEmailLinkClientMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(
  email: string,
  next = "/dashboard",
  password?: string,
) {
  const data = new FormData();
  data.set("email", email);
  data.set("next", next);
  if (password) data.set("password", password);
  return data;
}

async function runBackgroundTask() {
  expect(afterMock).toHaveBeenCalledTimes(1);
  const task = backgroundTasks.shift();
  expect(task).toBeDefined();
  await task?.();
}

describe("unified email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    backgroundTasks.length = 0;
    afterMock.mockImplementation((callback: () => void | Promise<void>) => {
      backgroundTasks.push(callback);
    });
    createEmailLinkClientMock.mockReturnValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    signInWithOtpMock.mockResolvedValue({ error: null });
  });

  it("only exposes async server actions at runtime", () => {
    expect(Object.keys(volunteerSignInActions).sort()).toEqual([
      "continueWithEmail",
      "verifyVolunteerEmailOtp",
    ]);
    expect(volunteerSignInActions.continueWithEmail.constructor.name).toBe(
      "AsyncFunction",
    );
    expect(
      volunteerSignInActions.verifyVolunteerEmailOtp.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("sends a normalized volunteer OTP and permits first-time account creation", async () => {
    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData(
        " New.Volunteer@Example.Test ",
        "/opportunities/community-day",
      ),
    );

    expect(result).toEqual({
      status: "success",
      step: "otp",
      message: expect.stringContaining("6-digit verification code"),
      email: "new.volunteer@example.test",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();

    await runBackgroundTask();

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      options: {
        shouldCreateUser: true,
      },
    });
  });

  it("routes every MENDAKI-domain address to the password step without checking account existence", async () => {
    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData(" Staff.User@MENDAKI.ORG.SG "),
    );

    expect(result).toEqual({
      status: "idle",
      step: "staff_password",
      message: "",
      email: "staff.user@mendaki.org.sg",
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("does not classify lookalike domains as MENDAKI staff", async () => {
    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData("staff@mendaki.org.sg.attacker.example"),
    );

    expect(result.step).toBe("otp");
    await runBackgroundTask();
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid email before scheduling delivery", async () => {
    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      step: "email",
      message: "Enter a valid email address.",
    });
    expect(afterMock).not.toHaveBeenCalled();
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("keeps volunteer delivery failures non-disclosing", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "over_email_send_rate_limit", status: 429 },
    });
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData("volunteer@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).not.toContain("volunteer@example.test");

    await runBackgroundTask();

    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer email OTP request was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    );
  });
});
