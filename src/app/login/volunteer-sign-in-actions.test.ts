import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createEmailLinkClientMock,
  getPhaseOneAdminClientMock,
  listUsersMock,
  signInWithOtpMock,
  updateUserByIdMock,
  userAccountMaybeSingleMock,
} = vi.hoisted(() => ({
  createEmailLinkClientMock: vi.fn(),
  getPhaseOneAdminClientMock: vi.fn(),
  listUsersMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
  userAccountMaybeSingleMock: vi.fn(),
}));

vi.mock("@/lib/supabase/email-link", () => ({
  createEmailLinkClient: createEmailLinkClientMock,
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getPhaseOneAdminClientMock,
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

describe("unified email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createEmailLinkClientMock.mockReturnValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    userAccountMaybeSingleMock.mockResolvedValue({ data: null, error: null });
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    updateUserByIdMock.mockResolvedValue({ data: { user: null }, error: null });
    getPhaseOneAdminClientMock.mockReturnValue({
      auth: {
        admin: {
          listUsers: listUsersMock,
          updateUserById: updateUserByIdMock,
        },
      },
      schema: vi.fn(() => ({
        from: vi.fn(() => ({
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              maybeSingle: userAccountMaybeSingleMock,
            })),
          })),
        })),
      })),
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
      message: expect.stringContaining("verification email"),
      email: "new.volunteer@example.test",
    });

    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "new.volunteer@example.test",
      options: {
        shouldCreateUser: true,
        data: {
          email_purpose: "volunteer_signup",
        },
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
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("does not classify lookalike domains as MENDAKI staff", async () => {
    const result = await volunteerSignInActions.continueWithEmail(
      { status: "idle", step: "email", message: "" },
      formData("staff@mendaki.org.sg.attacker.example"),
    );

    expect(result.step).toBe("otp");
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
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("does not claim delivery when Supabase rejects the verification email", async () => {
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

    expect(result).toEqual({
      status: "error",
      step: "email",
      message:
        "Please wait a minute before requesting another verification email.",
      email: "volunteer@example.test",
    });
    expect(consoleError).toHaveBeenCalledWith(
      "Volunteer verification email was not delivered",
      expect.objectContaining({
        code: "over_email_send_rate_limit",
        status: 429,
      }),
    );
  });
});
