import { beforeEach, describe, expect, it, vi } from "vitest";

const { requireActiveAccountMock, updateUserMock } = vi.hoisted(() => ({
  requireActiveAccountMock: vi.fn(),
  updateUserMock: vi.fn(),
}));

vi.mock("@/lib/auth/account-access", () => ({
  requireActiveAccount: requireActiveAccountMock,
}));

import * as passwordActions from "@/app/account/password/actions";

function passwordForm(overrides?: {
  currentPassword?: string;
  newPassword?: string;
  confirmPassword?: string;
}) {
  const formData = new FormData();
  formData.set(
    "currentPassword",
    overrides?.currentPassword ?? "old correct password",
  );
  formData.set(
    "newPassword",
    overrides?.newPassword ?? "new correct horse battery staple",
  );
  formData.set(
    "confirmPassword",
    overrides?.confirmPassword ?? "new correct horse battery staple",
  );
  return formData;
}

describe("staff password change server action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    updateUserMock.mockResolvedValue({ error: null });
    requireActiveAccountMock.mockResolvedValue({
      userId: "60000000-0000-4000-8000-000000000001",
      supabase: { auth: { updateUser: updateUserMock } },
    });
  });

  it("only exports an async server action at runtime", () => {
    expect(Object.keys(passwordActions)).toEqual(["changePassword"]);
    expect(passwordActions.changePassword.constructor.name).toBe("AsyncFunction");
  });

  it("requires the current password when updating the password", async () => {
    await expect(
      passwordActions.changePassword(
        { status: "idle", message: "" },
        passwordForm(),
      ),
    ).resolves.toEqual({
      status: "success",
      message: "Your password has been changed.",
    });

    expect(requireActiveAccountMock).toHaveBeenCalledWith("/account/password");
    expect(updateUserMock).toHaveBeenCalledWith({
      password: "new correct horse battery staple",
      currentPassword: "old correct password",
    });
  });

  it("rejects mismatched new passwords before accessing the account", async () => {
    await expect(
      passwordActions.changePassword(
        { status: "idle", message: "" },
        passwordForm({ confirmPassword: "different new password" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "The new passwords do not match.",
    });
    expect(requireActiveAccountMock).not.toHaveBeenCalled();
  });

  it("does not expose whether the current password or policy caused rejection", async () => {
    updateUserMock.mockResolvedValue({
      error: { code: "invalid_credentials", status: 400 },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      passwordActions.changePassword(
        { status: "idle", message: "" },
        passwordForm(),
      ),
    ).resolves.toEqual({
      status: "error",
      message:
        "The password could not be changed. Check the current password and the new password requirements.",
    });
  });
});
