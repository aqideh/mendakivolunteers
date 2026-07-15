const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "AUTH_ALLOW_SIGN_UP",
  "YMHUB_REGISTRATION_ALLOWED_HOSTS",
];

const secureUrlSettings = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
];

const errors = [];

if (process.env.APP_ENV !== "production") {
  errors.push("APP_ENV must be production.");
}

if (!["true", "false"].includes(process.env.AUTH_ALLOW_SIGN_UP ?? "")) {
  errors.push("AUTH_ALLOW_SIGN_UP must be explicitly set to true or false.");
}

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`${name} is required.`);
    continue;
  }

  if (/PROTO|PLACEHOLDER|\[[A-Z0-9_]+\]/i.test(value)) {
    errors.push(`${name} still contains a prototype or placeholder value.`);
  }
}

const registrationHosts = process.env.YMHUB_REGISTRATION_ALLOWED_HOSTS
  ?.split(",")
  .map((host) => host.trim().toLowerCase())
  .filter(Boolean);

if (registrationHosts) {
  for (const host of registrationHosts) {
    if (
      !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)*[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(
        host,
      )
    ) {
      errors.push(
        "YMHUB_REGISTRATION_ALLOWED_HOSTS must contain DNS hostnames only.",
      );
    }

    if (host === "example.invalid" || /proto|placeholder/i.test(host)) {
      errors.push(
        "YMHUB_REGISTRATION_ALLOWED_HOSTS must not contain development hosts.",
      );
    }
  }
}

errors.push(
  "Production deployment is blocked until the read-only Salesforce YM Hub adapter is implemented and verified.",
);

for (const name of secureUrlSettings) {
  const value = process.env[name]?.trim();
  if (!value) {
    continue;
  }

  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      errors.push(`${name} must use HTTPS in production.`);
    }
    if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
      errors.push(`${name} cannot use a local hostname in production.`);
    }
  } catch {
    errors.push(`${name} must be a valid absolute URL.`);
  }
}

if (errors.length > 0) {
  console.error("Production readiness check failed:\n");
  for (const error of errors) {
    console.error(`- ${error}`);
  }
  process.exit(1);
}

console.log("Production readiness configuration passed.");
