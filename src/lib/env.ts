import { z } from "zod";

const publicConfigSchema = z.object({
  appUrl: z.string().url(),
  supabaseUrl: z.string().url(),
  supabasePublishableKey: z.string().min(1),
});

const appEnvironmentSchema = z.enum([
  "development",
  "test",
  "staging",
  "production",
]);

const vercelEnvironmentSchema = z.enum(["development", "preview", "production"]);
const booleanSettingSchema = z.enum(["true", "false"]);
const hostnameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(
    /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/,
    "Registration hosts must be plain DNS hostnames without schemes, ports, or paths.",
  );

const vercelSupabaseUrl = "https://glpdougaxlgaipqlzcbq.supabase.co";
const vercelSupabasePublishableKey =
  "sb_publishable_H4hkv5q-5cSz_rlEqligFA_0fUMrzVL";

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type Environment = Readonly<Record<string, string | undefined>>;

function inferVercelAppUrl(environment: Environment): string | undefined {
  const hostname =
    environment.VERCEL_ENV === "production"
      ? environment.VERCEL_PROJECT_PRODUCTION_URL ?? environment.VERCEL_URL
      : environment.VERCEL_URL;

  return hostname ? `https://${hostname}` : undefined;
}

export function getPublicConfig(environment: Environment = process.env) {
  const isVercel = vercelEnvironmentSchema.safeParse(environment.VERCEL_ENV).success;

  return publicConfigSchema.parse({
    appUrl:
      environment.NEXT_PUBLIC_APP_URL ??
      (isVercel ? inferVercelAppUrl(environment) : undefined),
    supabaseUrl:
      environment.NEXT_PUBLIC_SUPABASE_URL ??
      (isVercel ? vercelSupabaseUrl : undefined),
    supabasePublishableKey:
      environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
      (isVercel ? vercelSupabasePublishableKey : undefined),
  });
}

export function getAppEnvironment(
  environment: Environment = process.env,
): AppEnvironment {
  if (environment.APP_ENV) {
    return appEnvironmentSchema.parse(environment.APP_ENV);
  }

  const vercelEnvironment = vercelEnvironmentSchema.safeParse(
    environment.VERCEL_ENV,
  );
  if (vercelEnvironment.success) {
    if (vercelEnvironment.data === "preview") return "staging";
    return vercelEnvironment.data;
  }

  return appEnvironmentSchema.parse(environment.APP_ENV);
}

export function isAuthSignUpAllowed(
  environment: Environment = process.env,
): boolean {
  return booleanSettingSchema.parse(environment.AUTH_ALLOW_SIGN_UP) === "true";
}

export function getRegistrationAllowedHosts(
  environment: Environment = process.env,
): readonly string[] {
  const value = z.string().trim().min(1).parse(
    environment.YMHUB_REGISTRATION_ALLOWED_HOSTS,
  );
  const hosts = value.split(",").map((host) => hostnameSchema.parse(host));

  if (new Set(hosts).size !== hosts.length) {
    throw new Error("YMHUB_REGISTRATION_ALLOWED_HOSTS contains duplicate hosts");
  }

  return hosts;
}
