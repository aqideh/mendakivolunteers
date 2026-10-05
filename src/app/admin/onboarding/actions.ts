"use server";

import type { User } from "@supabase/supabase-js";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";

import { requireAdmin } from "@/lib/auth/staff-access";
import {
  createSecureToken,
  hashSecureToken,
} from "@/lib/auth/volunteer-onboarding-invite";
import { getPublicConfig } from "@/lib/env";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

const volunteerIdSchema = z.string().uuid();
const emailSchema = z.string().trim().email().max(254);
const activeInviteStatuses = ["pending", "sent", "redeeming"];

function readText(formData: FormData, key: string, max = 120) {
  const value = formData.get(key);
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function destination(
  formData: FormData,
  kind: "success" | "error",
  code: string,
) {
  const params = new URLSearchParams();
  const query = readText(formData, "returnQuery", 160);
  const status = readText(formData, "returnStatus", 40);
  const volunteerCode = readText(formData, "volunteerCode", 40);

  if (query) params.set("q", query);
  if (status && status !== "all") params.set("status", status);
  params.set(kind, code);
  if (volunteerCode) params.set("volunteer", volunteerCode);

  return `/admin/onboarding?${params.toString()}`;
}

async function findAuthUserByEmail(email: string): Promise<User | null> {
  const admin = getPhaseOneAdminClient();
  const perPage = 1000;

  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const match =
      data.users.find(
        (user) => user.email?.trim().toLowerCase() === email,
      ) ?? null;

    if (match || data.users.length < perPage) return match;
  }
}

export async function sendVolunteerOnboardingInvite(formData: FormData) {
  const parsedVolunteerId = volunteerIdSchema.safeParse(
    formData.get("volunteerId"),
  );
  const parsedEmail = emailSchema.safeParse(formData.get("email"));

  if (!parsedVolunteerId.success || !parsedEmail.success) {
    redirect(destination(formData, "error", "invalid"));
  }

  const email = parsedEmail.data.toLowerCase();
  if (email.endsWith("@mendaki.org.sg")) {
    redirect(destination(formData, "error", "work_email"));
  }

  const { userId: invitedBy } = await requireAdmin("/admin/onboarding");
  const admin = getPhaseOneAdminClient();

  const volunteerResult = await admin
    .schema("core")
    .from("volunteers")
    .select(
      "id, volunteer_code, display_name, primary_email_normalized, auth_user_id",
    )
    .eq("id", parsedVolunteerId.data)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    redirect(destination(formData, "error", "volunteer_missing"));
  }

  const volunteer = volunteerResult.data;

  const profileResult = await admin
    .from("keluarga_volunteer_profiles")
    .select("onboarding_completed_at")
    .eq("volunteer_id", volunteer.id)
    .maybeSingle();

  if (profileResult.error) {
    redirect(destination(formData, "error", "profile_check"));
  }

  if (volunteer.auth_user_id && profileResult.data?.onboarding_completed_at) {
    redirect(destination(formData, "error", "already_active"));
  }

  let targetUser: User | null = null;
  let createdTransportUser = false;
  let originalAppMetadata: Record<string, unknown> | null = null;

  if (volunteer.auth_user_id) {
    const authResult = await admin.auth.admin.getUserById(volunteer.auth_user_id);
    if (authResult.error || !authResult.data.user) {
      redirect(destination(formData, "error", "auth_lookup"));
    }
    targetUser = authResult.data.user;
    if (targetUser.email?.trim().toLowerCase() !== email) {
      redirect(destination(formData, "error", "linked_email_mismatch"));
    }
  } else {
    try {
      targetUser = await findAuthUserByEmail(email);
    } catch (error) {
      console.error("Unable to look up volunteer auth account", {
        message: error instanceof Error ? error.message : "unknown",
      });
      redirect(destination(formData, "error", "auth_lookup"));
    }

    if (targetUser) {
      const linkedVolunteerResult = await admin
        .schema("core")
        .from("volunteers")
        .select("id, volunteer_code")
        .eq("auth_user_id", targetUser.id)
        .maybeSingle();

      if (linkedVolunteerResult.error) {
        redirect(destination(formData, "error", "auth_lookup"));
      }
      if (
        linkedVolunteerResult.data &&
        linkedVolunteerResult.data.id !== volunteer.id
      ) {
        redirect(destination(formData, "error", "identity_conflict"));
      }
    } else {
      const createResult = await admin.auth.admin.createUser({
        email,
        email_confirm: false,
        app_metadata: {
          keluarga_transport_only: true,
          onboarding_invite_pending: true,
        },
        ...(volunteer.display_name
          ? { user_metadata: { full_name: volunteer.display_name } }
          : {}),
      });

      if (createResult.error || !createResult.data.user) {
        console.error("Unable to prepare onboarding email transport identity", {
          code: createResult.error?.code,
          status: createResult.error?.status,
        });
        redirect(destination(formData, "error", "account_create"));
      }

      targetUser = createResult.data.user;
      createdTransportUser = true;
    }
  }

  if (!targetUser) {
    redirect(destination(formData, "error", "auth_lookup"));
  }

  originalAppMetadata = { ...(targetUser.app_metadata ?? {}) };

  const rolesResult = await admin
    .schema("core")
    .from("user_roles")
    .select("role")
    .eq("user_id", targetUser.id);

  if (
    rolesResult.error ||
    (rolesResult.data ?? []).some(({ role }) =>
      ["volunteer_leader", "staff", "volteam", "admin"].includes(role),
    )
  ) {
    if (createdTransportUser) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }
    redirect(destination(formData, "error", "staff_account"));
  }

  const [activeVolunteerInviteResult, activeAuthInviteResult] =
    await Promise.all([
      admin
        .schema("core")
        .from("volunteer_onboarding_invites")
        .select("id, auth_user_id, email_normalized, send_count, status")
        .eq("volunteer_id", volunteer.id)
        .in("status", activeInviteStatuses)
        .maybeSingle(),
      admin
        .schema("core")
        .from("volunteer_onboarding_invites")
        .select("id, volunteer_id, status")
        .eq("auth_user_id", targetUser.id)
        .in("status", activeInviteStatuses)
        .maybeSingle(),
    ]);

  if (activeVolunteerInviteResult.error || activeAuthInviteResult.error) {
    if (createdTransportUser) {
      await admin.auth.admin.deleteUser(targetUser.id);
    }
    redirect(destination(formData, "error", "invite_record"));
  }

  if (
    activeVolunteerInviteResult.data?.status === "redeeming" ||
    activeAuthInviteResult.data?.status === "redeeming"
  ) {
    redirect(destination(formData, "error", "invite_busy"));
  }

  if (
    activeAuthInviteResult.data &&
    activeAuthInviteResult.data.volunteer_id !== volunteer.id
  ) {
    redirect(destination(formData, "error", "identity_conflict"));
  }

  const rawToken = createSecureToken();
  const tokenHash = hashSecureToken(rawToken);
  const nowDate = new Date();
  const now = nowDate.toISOString();
  const expiresAt = new Date(
    nowDate.getTime() + 7 * 24 * 60 * 60 * 1000,
  ).toISOString();

  let inviteId: string;
  let previousSendCount = 0;

  const reusableInvite =
    activeVolunteerInviteResult.data?.auth_user_id === targetUser.id
      ? activeVolunteerInviteResult.data
      : null;

  if (activeVolunteerInviteResult.data && !reusableInvite) {
    const revokeResult = await admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .update({
        status: "revoked",
        revoked_at: now,
        token_hash: null,
        redemption_nonce: null,
        redemption_started_at: null,
        updated_at: now,
        last_error: "superseded_by_new_admin_invitation",
      })
      .eq("id", activeVolunteerInviteResult.data.id);

    if (revokeResult.error) {
      if (createdTransportUser) await admin.auth.admin.deleteUser(targetUser.id);
      redirect(destination(formData, "error", "invite_record"));
    }
  }

  if (reusableInvite) {
    inviteId = reusableInvite.id;
    previousSendCount = reusableInvite.send_count ?? 0;

    const updateResult = await admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .update({
        auth_user_id: targetUser.id,
        email_normalized: email,
        status: "pending",
        invited_by: invitedBy,
        token_hash: tokenHash,
        expires_at: expiresAt,
        accepted_at: null,
        revoked_at: null,
        redemption_nonce: null,
        redemption_started_at: null,
        verification_attempts: 0,
        locked_until: null,
        last_error: null,
        updated_at: now,
      })
      .eq("id", inviteId);

    if (updateResult.error) {
      redirect(destination(formData, "error", "invite_record"));
    }
  } else {
    const insertResult = await admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .insert({
        volunteer_id: volunteer.id,
        auth_user_id: targetUser.id,
        email_normalized: email,
        status: "pending",
        invited_by: invitedBy,
        token_hash: tokenHash,
        expires_at: expiresAt,
      })
      .select("id, send_count")
      .single();

    if (insertResult.error || !insertResult.data) {
      if (createdTransportUser) await admin.auth.admin.deleteUser(targetUser.id);
      console.error("Unable to create volunteer onboarding invitation", {
        code: insertResult.error?.code,
      });
      redirect(destination(formData, "error", "invite_record"));
    }

    inviteId = insertResult.data.id;
    previousSendCount = insertResult.data.send_count ?? 0;
  }

  const currentAppMetadata = targetUser.app_metadata ?? {};
  const metadataResult = await admin.auth.admin.updateUserById(targetUser.id, {
    app_metadata: {
      ...currentAppMetadata,
      keluarga_transport_only: true,
      onboarding_invite_pending: true,
      onboarding_invite_id: inviteId,
    },
  });

  if (metadataResult.error) {
    await admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .update({
        status: "failed",
        last_error: "transport_identity_lock_failed",
        updated_at: new Date().toISOString(),
      })
      .eq("id", inviteId);
    if (createdTransportUser) await admin.auth.admin.deleteUser(targetUser.id);
    redirect(destination(formData, "error", "account_create"));
  }

  const { appUrl } = getPublicConfig();
  const redirectTo = new URL("/onboarding/invite/open", appUrl);
  redirectTo.searchParams.set("t", rawToken);

  const emailResult = await admin.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: false,
      emailRedirectTo: redirectTo.toString(),
    },
  });

  if (emailResult.error) {
    console.error("Unable to send volunteer onboarding email", {
      code: emailResult.error.code,
      status: emailResult.error.status,
    });

    await admin
      .schema("core")
      .from("volunteer_onboarding_invites")
      .update({
        status: "failed",
        token_hash: null,
        last_error: `auth_email_send_failed:${emailResult.error.code ?? "unknown"}`,
        updated_at: new Date().toISOString(),
      })
      .eq("id", inviteId);

    if (createdTransportUser) {
      await admin.auth.admin.deleteUser(targetUser.id);
    } else if (originalAppMetadata) {
      await admin.auth.admin.updateUserById(targetUser.id, {
        app_metadata: originalAppMetadata,
      });
    }

    redirect(destination(formData, "error", "email_send"));
  }

  const sentAt = new Date().toISOString();
  const saveResult = await admin
    .schema("core")
    .from("volunteer_onboarding_invites")
    .update({
      status: "sent",
      last_sent_at: sentAt,
      send_count: previousSendCount + 1,
      last_error: null,
      updated_at: sentAt,
    })
    .eq("id", inviteId);

  if (saveResult.error) {
    console.error(
      "Volunteer onboarding email sent but invite status failed to save",
      { code: saveResult.error.code, inviteId },
    );
    redirect(destination(formData, "error", "invite_save"));
  }

  revalidatePath("/admin/onboarding");
  revalidatePath("/admin");
  redirect(destination(formData, "success", "sent"));
}
