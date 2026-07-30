import { NextRequest, NextResponse } from "next/server";

import { isPackageAction } from "@/lib/phaseone/package-action-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ slug: string; action: string }> },
) {
  const { slug, action } = await context.params;
  if (!isPackageAction(action)) {
    return NextResponse.json({ error: "Unknown event action." }, { status: 404 });
  }

  return NextResponse.redirect(
    new URL(`/api/phaseone/packages/${slug}/go/${action}`, request.url),
  );
}
