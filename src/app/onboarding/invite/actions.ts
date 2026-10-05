"use server";

import type { EmailOtpType, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";

import {
  createRedemptionNonce,
  hashSecureToken,
  volunteerOnboardingContextCookie,
} from "@/lib/auth/volunteer-onboarding-invite";
import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

const mobileSchema = z
  .string()
  .trim()
  .min(8)
  .max(32)
  .regex(/^[+()\-\s\d]+$/);

function inviteDestination(error?: string) {
  const params = new URLSearchParams();
  if (error) params.set("error", error);
  const query = params.toString();
  return query ? `/onboarding/invite?${query}` : "/onboarding/invite";
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

async function releaseRedemption(
  inviteId: string,
  nonce: string,
  reason: string,
) {
  const admin = getPhaseOneAdminClient();
  await admin
    .schema("core")
    .from("volunteer_onboarding_invites")
    .update({
      status: "sent",
      redemption_nonce: null,
      redemption_started_at: null,
      last_error: reason,
      updated_at: new Date().toISOString(),
    })
    .eq("id", inviteId)
    .eq("status", "redeeming")
    .eq("redemption_nonce", nonce);
}

export async function redeemVolunteerOnboardingInvite(formData: FormData) {
  const parsedMobile = mobileSchema.safeParse(formData.get("mobile"));
  if (!parsedMobile.success) {
    redirect(inviteDestination("verify"));
  }

  const cookieStore = await cookies();
  const contextSecret = cookieStore.get(volunteerOnboardingContextCookie)?.value;
  if (!contextSecret) {
    redirect(inviteDestination("expired_context"));
  }

  const contextHash = hashSecureToken(contextSecret);
  const redemptionNonce = createRedemptionNonce();
  const admin = getPhaseOneAdminClient();

  const beginResult = await admin
    .schema("core")
    .rpc("begin_volunteer_onboarding_redemption", {
      p_context_hash: contextHash,
      p_mobile: parsedMobile.data,
      p_redemption_nonce: redemptionNonce,
    });

  if (beginResult.error || !beginResult.data?.[0]) {
    console.error("Unable to begin volunteer onboarding redemption", {
      code: beginResult.error?.code,
    });
    redirect(inviteDestination("unavailable"));
  }

  const redemption = beginResult.data[0] as {
    result: string;
    invite_id: string | null;
    volunteer_id: string | null;
    email_normalized: string | null;
    auth_user_id: string | null;
    display_name: string | null;
  };

  const beginErrorMap: Record<string, string> = {
    invalid: "expired_context",
    expired: "expired",
    used: "used",
    revoked: "revoked",
    busy: "busy",
    locked: "locked",
    mismatch: "verify",
    no_mobile: "no_mobile",
    target_missing: "unavailable",
  };

  if (redemption.result !== "ok") {
    redirect(inviteDestination(beginErrorMap[redemption.result] ?? "unavailable"));
  }

  if (!redemption.invite_id || !redemption.email_normalized) {
    redirect(inviteDestination("unavailable"));
  }

  const inviteId = redemption.invite_id;
  const email = redemption.email_normalized;
  let authUser: User | null = null;
  let createdDuringRedemption = false;

  try {
    if (redemption.auth_user_id) {
      const authResult = await admin.auth.admin.getUserById(
        redemption.auth_user_id,
      );
      if (!authResult.error) authUser = authResult.data.user;
    }

    if (!authUser) {
      authUser = await findAuthUserByEmail(email);
    }

    if (!authUser) {
      const createResult = await admin.auth.admin.createUser({
        email,
        email_confirm: true,
        app_metadata: {
          keluarga_transport_only: false,
          onboarding_invite_pending: false,
          onboarding_invite_id: inviteId,
        },
        ...(redemption.display_name
          ? { user_metadata: { full_name: redemption.display_name } }
          : {}),
      });

      if (createResult.error || !createResult.data.user) {
        throw new Error(
          `Unable to create volunteer auth account: ${createResult.error?.code ?? "unknown"}`,
        );
      }
      authUser = createResult.data.user;
      createdDuringRedemption = true;
    } else {
      const updateResult = await admin.auth.admin.updateUserById(authUser.id, {
        email_confirm: true,
        app_metadata: {
          ...(authUser.app_metadata ?? {}),
          keluarga_transport_only: false,
          onboarding_invite_pending: false,
          onboarding_invite_id: inviteId,
        },
      });

      if (updateResult.error || !updateResult.data.user) {
        throw new Error(
          `Unable to activate volunteer auth account: ${updateResult.error?.code ?? "unknown"}`,
        );
      }
      authUser = updateResult.data.user;
    }

    const accountResult = await admin
      .schema("core")
      .from("user_accounts")
      .select("id")
      .eq("id", authUser.id)
      .maybeSingle();

    if (accountResult.error) {
      throw new Error("Unable to check Keluarga account record");
    }

    if (!accountResult.data) {
      const insertAccountResult = await admin
        .schema("core")
        .from("user_accounts")
        .insert({
          id: authUser.id,
          display_name: redemption.display_name,
          claimed_email_normalized: email,
          email_ownership_verified: true,
          email_ownership_verified_at: new Date().toISOString(),
        });

      if (insertAccountResult.error) {
        throw new Error("Unable to create Keluarga account record");
      }
    }

    const roleResult = await admin
      .schema("core")
      .from("user_roles")
      .upsert(
        {
          user_id: authUser.id,
          role: "volunteer",
          reason: "Activated by seven-day onboarding invitation",
        },
        { onConflict: "user_id,role", ignoreDuplicates: true },
      );

    if (roleResult.error) {
      throw new Error("Unable to grant volunteer role");
    }

    const generated = await admin.auth.admin.generateLink({
      type: "magiclink",
      email,
    });

    if (generated.error) {
      throw new Error(
        `Unable to mint onboarding session credential: ${generated.error.code ?? "unknown"}`,
      );
    }

    const tokenHash = generated.data.properties.hashed_token;
    const verificationType =
      (generated.data.properties.verification_type ?? "magiclink") as EmailOtpType;

    if (!tokenHash) {
      throw new Error("Generated onboarding credential did not include a token hash");
    }

    const supabase = await createClient();
    const verifyResult = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: verificationType,
    });

    if (verifyResult.error) {
      throw new Error(
        `Unable to establish onboarding session: ${verifyResult.error.code ?? "unknown"}`,
      );
    }

    const completeResult = await (
      supabase as unknown as {
        schema: (schema: string) => {
          rpc: (
            fn: string,
            args: Record<string, unknown>,
          ) => Promise<{ data: unknown; error: { code?: string; message?: string } | null }>;
        };
      }
    )
      .schema("core")
      .rpc("complete_volunteer_onboarding_redemption", {
        p_invite_id: inviteId,
        p_redemption_nonce: redemptionNonce,
      });

    if (
      completeResult.error ||
      !["linked_existing", "already_linked"].includes(
        String(completeResult.data ?? ""),
      )
    ) {
      throw new Error(
        `Unable to complete onboarding linkage: ${completeResult.error?.code ?? completeResult.data ?? "unknown"}`,
      );
    }

    cookieStore.delete(volunteerOnboardingContextCookie);
    redirect("/profile/setup");
  } catch (error) {
    console.error("Volunteer onboarding redemption failed", {
      message: error instanceof Error ? error.message : "unknown",
      inviteId,
    });

    const supabase = await createClient();
    await supabase.auth.signOut({ scope: "local" });

    await releaseRedemption(
      inviteId,
      redemptionNonce,
      "onboarding_redemption_failed",
    );

    if (authUser) {
      if (createdDuringRedemption) {
        await admin
          .schema("core")
          .from("user_accounts")
          .delete()
          .eq("id", authUser.id);
        await admin.auth.admin.deleteUser(authUser.id);
      } else {
        await admin.auth.admin.updateUserById(authUser.id, {
          app_metadata: {
            ...(authUser.app_metadata ?? {}),
            keluarga_transport_only: true,
            onboarding_invite_pending: true,
            onboarding_invite_id: inviteId,
          },
        });
      }
    }

    redirect(inviteDestination("unavailable"));
  }
}
