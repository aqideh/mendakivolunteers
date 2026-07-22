import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  getPhaseOneAdminClientMock,
  redirectMock,
  rpcMock,
  schemaMock,
  updateUserByIdMock,
} = vi.hoisted(() => ({
  getPhaseOneAdminClientMock: vi.fn(),
  redirectMock: vi.fn(),
  rpcMock: vi.fn(),
  schemaMock: vi.fn(),
  updateUserByIdMock: vi.fn(),
}));

vi.mock("@/lib/phaseone/admin", () => ({
  getPhaseOneAdminClient: getPhaseOneAdminClientMock,
}));

vi.mock("next/navigation", () => ({
  redirect: redirectMock,
}));

import * as setPasswordActions from "@/app/set-password/actions";

const staffUserId = "60000000-0000-4000-8000-000000000002";
const validToken = "A".repeat(43);

function setupForm(overrides?: {
  token?: string;
  password?: string;
  confirmPassword?: string;
}) {
  const formData = new FormData();
  formData.set("token", overrides?.token ?? validToken);
  formData.set(
    "password",
    overrides?.password ?? "correct horse battery staple",
  );
  formData.set(
    "confirmPassword",
    overrides?.confirmPassword ?? "correct horse battery staple",
  );
  return formData;
}

describe("initial staff password server action", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    schemaMock.mockReturnValue({ rpc: rpcMock });
    rpcMock.mockResolvedValue({ data: staffUserId, error: null });
    updateUserByIdMock.mockResolvedValue({ error: null });
    getPhaseOneAdminClientMock.mockReturnValue({
      schema: schemaMock,
      auth: { admin: { updateUserById: updateUserByIdMock } },
    });
  });

  it("only exports an async server action at runtime", () => {
    expect(Object.keys(setPasswordActions)).toEqual(["setInitialPassword"]);
    expect(setPasswordActions.setInitialPassword.constructor.name).toBe(
      "AsyncFunction",
    );
  });

  it("consumes the setup token, updates the intended user and redirects", async () => {
    await setPasswordActions.setInitialPassword(
      { status: "idle", message: "" },
      setupForm(),
    );

    expect(schemaMock).toHaveBeenCalledWith("core");
    expect(rpcMock).toHaveBeenCalledWith(
      "consume_staff_password_setup_token",
      {
        p_token_hash:
          "0f007385b6f9d4b7eeb2748605afe1a984a0a3bfa3f014d09e2a784ce9e5cd1a",
      },
    );
    expect(updateUserByIdMock).toHaveBeenCalledWith(staffUserId, {
      password: "correct horse battery staple",
    });
    expect(redirectMock).toHaveBeenCalledWith("/login?password=setup");
  });

  it("rejects malformed tokens without accessing the admin client", async () => {
    await expect(
      setPasswordActions.setInitialPassword(
        { status: "idle", message: "" },
        setupForm({ token: "too-short" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "This password setup link is invalid or has expired.",
    });
    expect(getPhaseOneAdminClientMock).not.toHaveBeenCalled();
  });

  it("rejects a consumed or expired token without updating a user", async () => {
    rpcMock.mockResolvedValue({ data: null, error: null });

    await expect(
      setPasswordActions.setInitialPassword(
        { status: "idle", message: "" },
        setupForm(),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "This password setup link is invalid or has expired.",
    });
    expect(updateUserByIdMock).not.toHaveBeenCalled();
    expect(redirectMock).not.toHaveBeenCalled();
  });

  it("requires matching passwords of at least 12 characters", async () => {
    await expect(
      setPasswordActions.setInitialPassword(
        { status: "idle", message: "" },
        setupForm({ password: "long-enough-password", confirmPassword: "different" }),
      ),
    ).resolves.toEqual({
      status: "error",
      message: "The passwords do not match.",
    });
    expect(getPhaseOneAdminClientMock).not.toHaveBeenCalled();
  });
});
