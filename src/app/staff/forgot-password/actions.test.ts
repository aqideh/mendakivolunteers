import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  accountMaybeSingleMock,
  createClientMock,
  getPhaseOneAdminClientMock,
  getPublicConfigMock,
  getUserMock,
  listUsersMock,
  resetPasswordForEmailMock,
  rolesInMock,
} = vi.hoisted(() => ({
  accountMaybeSingleMock: vi.fn(),
  createClientMock: vi.fn(),
  getPhaseOneAdminClientMock: vi.fn(),
  getPublicConfigMock: vi.fn(),
  getUserMock: vi.fn(),
  listUsersMock: vi.fn(),
  resetPasswordForEmailMock: vi.fn(),
  rolesInMock: vi.fn(),
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getPhaseOneAdminClientMock,
}));

vi.mock("@/lib/env", () => ({
  getPublicConfig: getPublicConfigMock,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: createClientMock,
}));

import {
  requestStaffPasswordReset,
  validateCurrentStaffRecovery,
} from "@/app/staff/forgot-password/actions";

function buildAdmin() {
  return {
    auth: {
      admin: {
        listUsers: listUsersMock,
      },
      resetPasswordForEmail: resetPasswordForEmailMock,
    },
    schema: vi.fn(() => ({
      from: vi.fn((table: string) => ({
        select: vi.fn(() => ({
          eq: vi.fn(() =>
            table === "user_accounts"
              ? { maybeSingle: accountMaybeSingleMock }
              : { in: rolesInMock },
          ),
        })),
      })),
    })),
  };
}

function formData(email: string) {
  const data = new FormData();
  data.set("email", email);
  return data;
}

describe("staff forgot password", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getPublicConfigMock.mockReturnValue({
      appUrl: "https://keluarga.mendaki.org.sg",
    });
    getPhaseOneAdminClientMock.mockReturnValue(buildAdmin());
    createClientMock.mockResolvedValue({
      auth: { getUser: getUserMock },
    });
    listUsersMock.mockResolvedValue({ data: { users: [] }, error: null });
    accountMaybeSingleMock.mockResolvedValue({
      data: { status: "active" },
      error: null,
    });
    rolesInMock.mockResolvedValue({
      data: [{ role: "staff" }],
      error: null,
    });
    resetPasswordForEmailMock.mockResolvedValue({ error: null });
  });

  it("rejects non-MENDAKI addresses without touching account lookup", async () => {
    const result = await requestStaffPasswordReset(
      { status: "idle", message: "" },
      formData("volunteer@example.com"),
    );

    expect(result.status).toBe("error");
    expect(result.message).toContain("MENDAKI staff");
    expect(listUsersMock).not.toHaveBeenCalled();
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("does not disclose whether a MENDAKI account exists", async () => {
    const result = await requestStaffPasswordReset(
      { status: "idle", message: "" },
      formData("unknown@mendaki.org.sg"),
    );

    expect(result).toEqual({
      status: "success",
      message:
        "If this email has active Keluarga staff access, a password reset email has been sent.",
    });
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("sends recovery only for an active internal staff account", async () => {
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "staff.user@mendaki.org.sg",
          },
        ],
      },
      error: null,
    });

    const result = await requestStaffPasswordReset(
      { status: "idle", message: "" },
      formData(" Staff.User@MENDAKI.ORG.SG "),
    );

    expect(result.status).toBe("success");
    expect(resetPasswordForEmailMock).toHaveBeenCalledWith(
      "staff.user@mendaki.org.sg",
      {
        redirectTo:
          "https://keluarga.mendaki.org.sg/auth/confirm?flow=staff_recovery&account=11111111-1111-4111-8111-111111111111",
      },
    );
  });

  it("does not send recovery for inactive staff", async () => {
    listUsersMock.mockResolvedValue({
      data: {
        users: [
          {
            id: "11111111-1111-4111-8111-111111111111",
            email: "staff.user@mendaki.org.sg",
          },
        ],
      },
      error: null,
    });
    accountMaybeSingleMock.mockResolvedValue({
      data: { status: "suspended" },
      error: null,
    });

    const result = await requestStaffPasswordReset(
      { status: "idle", message: "" },
      formData("staff.user@mendaki.org.sg"),
    );

    expect(result.status).toBe("success");
    expect(resetPasswordForEmailMock).not.toHaveBeenCalled();
  });

  it("rechecks active internal staff access during recovery", async () => {
    getUserMock.mockResolvedValue({
      data: {
        user: {
          id: "11111111-1111-4111-8111-111111111111",
          email: "staff.user@mendaki.org.sg",
        },
      },
      error: null,
    });

    await expect(validateCurrentStaffRecovery()).resolves.toBe(true);

    rolesInMock.mockResolvedValue({ data: [], error: null });
    await expect(validateCurrentStaffRecovery()).resolves.toBe(false);
  });
});
