import "server-only";

import { z } from "zod";

import type { OnboardingInvitationMail } from "@/lib/email/onboarding-invitation";

/**
 * Onboarding email is intentionally separate from Supabase Auth's OTP delivery.
 * Set up a domain-verified, restricted application API key before using this path.
 */
const senderSchema = z.string().email();
const apiKeySchema = z.string().min(10);

export class OnboardingEmailDeliveryError extends Error {
  constructor(
    readonly code: "not_configured" | "provider_unavailable" | "provider_rejected",
  ) {
    super("Volunteer onboarding invitation delivery failed");
    this.name = "OnboardingEmailDeliveryError";
  }
}

export async function sendOnboardingInvitation(input: {
  to: string;
  message: OnboardingInvitationMail;
  idempotencyKey: string;
}): Promise<string> {
  const key = apiKeySchema.safeParse(process.env.KELUARGA_INVITE_RESEND_API_KEY);
  const from = senderSchema.safeParse(process.env.KELUARGA_INVITE_EMAIL_FROM);
  if (!key.success || !from.success) {
    throw new OnboardingEmailDeliveryError("not_configured");
  }

  // No unsanitized token or invitation URL is logged, including on errors.
  let response: Response;
  try {
    response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key.data}`,
        "Content-Type": "application/json",
        "Idempotency-Key": input.idempotencyKey,
      },
      body: JSON.stringify({
        from: `Keluarga MENDAKI <${from.data}>`,
        to: [input.to],
        subject: input.message.subject,
        html: input.message.html,
        text: input.message.text,
      }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store",
    });
  } catch {
    throw new OnboardingEmailDeliveryError("provider_unavailable");
  }

  if (!response.ok) {
    throw new OnboardingEmailDeliveryError(
      response.status >= 500 || response.status === 429
        ? "provider_unavailable"
        : "provider_rejected",
    );
  }

  const payload: unknown = await response.json().catch(() => null);
  const result = z.object({ id: z.string().min(1) }).safeParse(payload);
  if (!result.success) {
    throw new OnboardingEmailDeliveryError("provider_unavailable");
  }
  return result.data.id;
}
