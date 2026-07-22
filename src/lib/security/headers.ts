import type { AppEnvironment } from "@/lib/env";

type ContentSecurityPolicyOptions = Readonly<{
  appEnvironment: AppEnvironment;
  nonce: string;
  supabaseUrl: string;
}>;

export function buildContentSecurityPolicy({
  appEnvironment,
  nonce,
  supabaseUrl,
}: ContentSecurityPolicyOptions): string {
  const supabaseOrigin = new URL(supabaseUrl).origin;
  const websocketOrigin = supabaseOrigin.replace(/^http/, "ws");
  const developmentScriptSource =
    appEnvironment === "development" ? " 'unsafe-eval'" : "";

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${developmentScriptSource}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' data: blob: ${supabaseOrigin} https://volunteer.gov.sg https://www.volunteer.gov.sg`,
    "font-src 'self' data:",
    `connect-src 'self' ${supabaseOrigin} ${websocketOrigin}`,
    "frame-ancestors 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "object-src 'none'",
  ].join("; ");
}
