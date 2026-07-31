const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "VOLUNTEER_GOV_SG_MENDAKI_URL",
  "CRON_SECRET",
  "PIN_COOKIE_SECRET",
  "AUTH_ALLOW_SIGN_UP",
];

const secureUrlSettings = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "VOLUNTEER_GOV_SG_MENDAKI_URL",
];

const secretSettings = [
  "SUPABASE_SERVICE_ROLE_KEY",
  "CRON_SECRET",
  "PIN_COOKIE_SECRET",
];

const errors = [];

if (process.env.APP_ENV !== "production") {
  errors.push("APP_ENV must be production.");
}

if (process.env.AUTH_ALLOW_SIGN_UP !== "false") {
  errors.push("AUTH_ALLOW_SIGN_UP must be false for the Phase One staff-only release.");
}

for (const name of required) {
  const value = process.env[name]?.trim();
  if (!value) {
    errors.push(`${name} is required.`);
    continue;
  }

  if (/PROTO|PLACEHOLDER|CHANGE_ME|\[[A-Z0-9_]+\]/i.test(value)) {
    errors.push(`${name} still contains a prototype or placeholder value.`);
  }
}

for (const name of secretSettings) {
  const value = process.env[name]?.trim();
  if (value && value.length < 32) {
    errors.push(`${name} must contain at least 32 characters.`);
  }
}

if (
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.PIN_COOKIE_SECRET &&
  process.env.SUPABASE_SERVICE_ROLE_KEY === process.env.PIN_COOKIE_SECRET
) {
  errors.push("PIN_COOKIE_SECRET must be different from SUPABASE_SERVICE_ROLE_KEY.");
}

for (const name of secureUrlSettings) {
  const value = process.env[name]?.trim();
  if (!value) continue;

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

console.log("Phase One production readiness configuration passed.");
