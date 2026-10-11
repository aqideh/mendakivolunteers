/**
 * Volunteer onboarding invitations are NOT Supabase authentication emails.
 * This renderer is deliberately independent of auth.user_metadata.
 */
export type OnboardingInvitationMail = Readonly<{
  subject: string;
  html: string;
  text: string;
}>;

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderOnboardingInvitation(input: {
  displayName: string;
  invitationUrl: string;
  appUrl: string;
}): OnboardingInvitationMail {
  const expectedOrigin = new URL(input.appUrl).origin;
  const target = new URL(input.invitationUrl);
  if (
    target.origin !== expectedOrigin ||
    target.pathname !== "/onboarding/invite/open" ||
    !target.searchParams.get("t") ||
    [...target.searchParams.keys()].some((key) => key !== "t") ||
    target.hash
  ) {
    throw new Error("Invalid volunteer onboarding invitation URL");
  }
  const name = input.displayName.trim() || "volunteer";
  const safeName = escapeHtml(name);
  const safeUrl = escapeHtml(target.toString());
  const subject = "Activate your Keluarga MENDAKI volunteer profile";
  return {
    subject,
    html: `<!doctype html>
<html lang="en"><body style="margin:0;padding:32px 16px;background:#f6f6f4;font-family:Arial,Helvetica,sans-serif;color:#373a36">
<table role="presentation" style="max-width:560px;width:100%;margin:auto;background:#fff;border-radius:16px" cellspacing="0" cellpadding="0">
<tr><td style="background:#ffd700;padding:24px 32px;font-size:24px;font-weight:700">Keluarga MENDAKI</td></tr>
<tr><td style="padding:32px"><h1 style="font-size:24px">Activate your Keluarga volunteer profile</h1>
<p>Hello ${safeName},</p>
<p>You have an existing MENDAKI volunteer record. Use this invitation to connect it to your Keluarga profile.</p>
<p style="margin:28px 0"><a href="${safeUrl}" style="display:inline-block;padding:14px 24px;background:#373a36;color:#fff;border-radius:10px;text-decoration:none">Activate my profile</a></p>
<p>This invitation is valid for seven days. You will be asked to verify your existing volunteer record before activation.</p>
<p>If you did not expect this invitation, you can ignore this email.</p>
<p>Regards,<br>The Keluarga MENDAKI Team<br>Yayasan MENDAKI</p></td></tr></table>
</body></html>`,
    text: `Hello ${name},\n\nActivate your Keluarga MENDAKI volunteer profile and connect your existing MENDAKI volunteering records.\n\n${target.toString()}\n\nThis invitation is valid for seven days. You will need to verify a detail from your existing volunteer record.\n\nIf you did not request this, ignore the email.\n\nThe Keluarga MENDAKI Team\nYayasan MENDAKI`,
  };
}
