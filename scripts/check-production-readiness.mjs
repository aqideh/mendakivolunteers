const required = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "YMHUB_BASE_URL",
  "YMHUB_CLIENT_ID",
  "YMHUB_CLIENT_SECRET",
  "YMHUB_VOLUNTEER_OBJECT_API",
  "YMHUB_VOLUNTEER_ID_FIELD_API",
  "YMHUB_VOLUNTEER_STATUS_FIELD_API",
  "YMHUB_VOLUNTEER_UPDATED_AT_FIELD_API",
];

const secureUrlSettings = [
  "NEXT_PUBLIC_APP_URL",
  "NEXT_PUBLIC_SUPABASE_URL",
  "YMHUB_BASE_URL",
];

const errors = [];

if (process.env.APP_ENV !== "production") {
  errors.push("APP_ENV must be production.");
}

if (process.env.YMHUB_CONNECTOR_MODE !== "salesforce") {
  errors.push("YMHUB_CONNECTOR_MODE must be salesforce.");
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
