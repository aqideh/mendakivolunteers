import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  createClientMock,
  getPhaseOneAdminClientMock,
  getPublicConfigMock,
  rosterMaybeSingleMock,
  signInWithOtpMock,
} = vi.hoisted(() => ({
  createClientMock: vi.fn(),
  getPhaseOneAdminClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  rosterMaybeSingleMock: vi.fn(),
  signInWithOtpMock: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getPhaseOneAdminClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
}));

import * as volunteerSignInActions from "@/app/login/volunteer-sign-in-actions";

function formData(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

describe("volunteer email sign-in", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createClientMock.mockResolvedValue({
      auth: { signInWithOtp: signInWithOtpMock },
    });
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://mendakivolunteers.vercel.app",
    });

    const rosterQuery = {
      select: vi.fn(),
      eq: vi.fn(),
      order: vi.fn(),
      limit: vi.fn(),
      maybeSingle: rosterMaybeSingleMock,
    };
    rosterQuery.select.mockReturnValue(rosterQuery);
    rosterQuery.eq.mockReturnValue(rosterQuery);
    rosterQuery.order.mockReturnValue(rosterQuery);
    rosterQuery.limit.mockReturnValue(rosterQuery);
    getPhaseOneAdminClientMock.mockReturnValue({
      from: vi.fn(() => rosterQuery),
    });

    signInWithOtpMock.mockResolvedValue({ error: null });
    rosterMaybeSingleMock.mockResolvedValue({ data: null, error: null });
  });

  it("only exposes the async server action at runtime", () => {
    expect(Object.keys(volunteerSignInActions)).toEqual([
      "requestVolunteerSignInLink",
    ]);
    expect(
      volunteerSignInActions.requestVolunteerSignInLink.constructor.name,
    ).toBe("AsyncFunction");
  });

  it("sends an existing KELUARGA account a link without consulting the roster", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData(" Existing.Volunteer@Example.Test "),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
    expect(signInWithOtpMock).toHaveBeenCalledWith({
      email: "existing.volunteer@example.test",
      options: {
        shouldCreateUser: false,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm",
      },
    });
    expect(rosterMaybeSingleMock).not.toHaveBeenCalled();
  });

  it("creates a passwordless KELUARGA account for a rostered email", async () => {
    signInWithOtpMock
      .mockResolvedValueOnce({
        error: { code: "user_not_found", status: 400 },
      })
      .mockResolvedValueOnce({ error: null });
    rosterMaybeSingleMock.mockResolvedValue({
      data: { volunteer_name: "Registered Volunteer" },
      error: null,
    });

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("registered@example.test"),
    );

    expect(result.status).toBe("success");
    expect(signInWithOtpMock).toHaveBeenCalledTimes(2);
    expect(signInWithOtpMock).toHaveBeenLastCalledWith({
      email: "registered@example.test",
      options: {
        shouldCreateUser: true,
        emailRedirectTo:
          "https://mendakivolunteers.vercel.app/auth/confirm",
        data: { full_name: "Registered Volunteer" },
      },
    });
  });

  it("does not reveal that an unknown address is not rostered", async () => {
    signInWithOtpMock.mockResolvedValue({
      error: { code: "user_not_found", status: 400 },
    });

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("unknown@example.test"),
    );

    expect(result.status).toBe("success");
    expect(result.message).toContain("If this email is linked");
    expect(signInWithOtpMock).toHaveBeenCalledTimes(1);
  });

  it("rejects an invalid email before calling Supabase", async () => {
    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("not-an-email"),
    );

    expect(result).toEqual({
      status: "error",
      message: "Enter a valid email address.",
    });
    expect(signInWithOtpMock).not.toHaveBeenCalled();
  });

  it("reports a delivery failure without exposing account state", async () => {
    signInWithOtpMock
      .mockResolvedValueOnce({
        error: { code: "user_not_found", status: 400 },
      })
      .mockResolvedValueOnce({
        error: { code: "over_email_send_rate_limit", status: 429 },
      });
    rosterMaybeSingleMock.mockResolvedValue({
      data: { volunteer_name: "Registered Volunteer" },
      error: null,
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await volunteerSignInActions.requestVolunteerSignInLink(
      { status: "idle", message: "" },
      formData("registered@example.test"),
    );

    expect(result.status).toBe("error");
    expect(result.message).not.toContain("registered");
  });
});
