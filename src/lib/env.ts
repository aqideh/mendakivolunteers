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
  const fallback = environment.NODE_ENV === "test" ? "test" : "development";
  return appEnvironmentSchema.parse(environment.APP_ENV ?? fallback);
}

export function isAuthSignUpAllowed(
  environment: Environment = process.env,
): boolean {
  return environment.AUTH_ALLOW_SIGN_UP === "true";
}
