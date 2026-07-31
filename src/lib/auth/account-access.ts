import { redirect } from "next/navigation";

import { createClient } from "@/lib/supabase/server";

export async function requireActiveAccount(next = "/dashboard") {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect(`/login?next=${encodeURIComponent(next)}`);
  }

  const { data: account, error: accountError } = await supabase
    .schema("core")
    .from("user_accounts")
    .select("status")
    .eq("id", userId)
    .maybeSingle();

  if (accountError) {
    console.error("Unable to verify account status", {
      code: accountError.code,
    });
    redirect("/login?error=account_authorization_unavailable");
  }

  if (account?.status !== "active") {
    redirect("/login?error=account_inactive");
  }

  return { supabase, userId };
}
