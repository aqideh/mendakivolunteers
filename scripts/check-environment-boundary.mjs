const productionProjectRef = "glpdougaxlgaipqlzcbq";
const stagingProjectRef = "nbnglontqrxywppmmhfm";

const vercelEnvironment = process.env.VERCEL_ENV;
const gitBranch = process.env.VERCEL_GIT_COMMIT_REF;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";

function fail(message) {
  console.error(`Environment boundary check failed: ${message}`);
  process.exit(1);
}

if (vercelEnvironment === "production") {
  if (!supabaseUrl.includes(productionProjectRef)) {
    fail("production deployments must use the production Supabase project");
  }
}

if (vercelEnvironment === "preview") {
  if (supabaseUrl.includes(productionProjectRef)) {
    fail("preview deployments must never use the production Supabase project");
  }

  if (gitBranch === "staging" && !supabaseUrl.includes(stagingProjectRef)) {
    fail("the staging branch must use the Keluarga Staging Supabase project");
  }
}

console.log("Environment boundary check passed.");
