import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    {
      error: "Shared event PIN access has been retired. Use the separate sign-in or sign-out PIN.",
    },
    { status: 410 },
  );
}
