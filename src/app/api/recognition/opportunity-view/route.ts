import { NextResponse } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";

import { createClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  let slug: unknown;
  try {
    slug = (await request.json()).slug;
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }
  if (typeof slug !== "string" || slug.length > 160 || !/^[a-z0-9-]+$/.test(slug)) {
    return NextResponse.json({ error: "Invalid opportunity" }, { status: 400 });
  }

  const supabase = await createClient();
  const { data: claims, error } = await supabase.auth.getClaims();
  if (error || !claims?.claims?.sub) {
    return new Response(null, { status: 204 });
  }
  const result = await (supabase as unknown as SupabaseClient)
    .schema("core")
    .rpc("record_volunteer_engagement", {
      p_action: "opportunity_view",
      p_context: slug,
    });
  if (result.error) {
    console.error("Could not record opportunity exploration", { code: result.error.code });
    return NextResponse.json({ error: "Recognition unavailable" }, { status: 500 });
  }
  return new Response(null, { status: 204 });
}
