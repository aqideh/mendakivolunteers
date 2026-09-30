import { NextResponse } from "next/server";

import { getPublicConfig } from "@/lib/env";

export const dynamic = "force-dynamic";

export async function GET() {
  const { supabaseUrl } = getPublicConfig();

  return NextResponse.json({
    vercelEnvironment: process.env.VERCEL_ENV ?? null,
    supabaseHost: new URL(supabaseUrl).host,
  });
}
