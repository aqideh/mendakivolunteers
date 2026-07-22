import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { fetchMendakiVolunteerGovSgListings } from "@/lib/phaseone/volunteer-gov-sg";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

let adminClient: SupabaseClient | null = null;

function getAdminClient(): SupabaseClient {
  if (adminClient) return adminClient;

  const config = z
    .object({
      url: z.string().url(),
      serviceRoleKey: z.string().min(1),
    })
    .parse({
      url: process.env.NEXT_PUBLIC_SUPABASE_URL,
      serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    });

  adminClient = createClient(config.url, config.serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return adminClient;
}

function isAuthorised(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  return request.headers.get("authorization") === `Bearer ${secret}`;
}

async function runSync() {
  const sourceUrl = z
    .string()
    .url()
    .parse(process.env.VOLUNTEER_GOV_SG_MENDAKI_URL);
  const supabase = getAdminClient();
  const { data: run, error: runError } = await supabase
    .from("phaseone_import_runs")
    .insert({ status: "running" })
    .select("id")
    .single();

  if (runError || !run) {
    throw new Error("Unable to create import audit record");
  }

  try {
    const opportunities = await fetchMendakiVolunteerGovSgListings(sourceUrl);
    const importedAt = opportunities[0]?.imported_at;

    const { error: upsertError } = await supabase
      .from("phaseone_external_opportunities")
      .upsert(opportunities, { onConflict: "source_key" });

    if (upsertError) throw upsertError;

    if (importedAt) {
      const { error: deactivateError } = await supabase
        .from("phaseone_external_opportunities")
        .update({ is_active: false })
        .lt("imported_at", importedAt);

      if (deactivateError) throw deactivateError;
    }

    const { error: completeError } = await supabase
      .from("phaseone_import_runs")
      .update({
        status: "succeeded",
        completed_at: new Date().toISOString(),
        imported_count: opportunities.length,
      })
      .eq("id", run.id);

    if (completeError) throw completeError;

    return { imported: opportunities.length };
  } catch (error) {
    const detail = error instanceof Error ? error.message : "Unknown import error";
    await supabase
      .from("phaseone_import_runs")
      .update({
        status: "failed",
        completed_at: new Date().toISOString(),
        error_code: "VOLUNTEER_GOV_SG_IMPORT_FAILED",
        error_detail: detail.slice(0, 500),
      })
      .eq("id", run.id);
    throw error;
  }
}

export async function GET(request: NextRequest) {
  if (!isAuthorised(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    return NextResponse.json(await runSync());
  } catch (error) {
    console.error("Phase-one opportunity sync failed", {
      message: error instanceof Error ? error.message : "Unknown error",
    });
    return NextResponse.json({ error: "Opportunity sync failed" }, { status: 502 });
  }
}
