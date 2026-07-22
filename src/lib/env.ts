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

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type Environment = Readonly<Record<string, string | undefined>>;

export function getPublicConfig() {
  return publicConfigSchema.parse({
    appUrl: process.env.NEXT_PUBLIC_APP_URL,
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
    supabasePublishableKey:
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
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
