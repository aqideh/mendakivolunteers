import { NextResponse } from "next/server";

const SOURCES = {
  list: "https://professionalnetworksuat.mendaki.org.sg/pn-sector/PN_Sector__c/Portal_Dislay_Active_PN_Sectors",
  aerospace:
    "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdPREA0/aerospace-and-aviation",
} as const;

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceKey = url.searchParams.get("source");
  if (sourceKey !== "list" && sourceKey !== "aerospace") {
    return NextResponse.json({ error: "Unsupported source" }, { status: 400 });
  }

  const response = await fetch(SOURCES[sourceKey], {
    cache: "no-store",
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; KeluargaMENDAKIStagingImporter/1.0; +https://keluargastaging.vercel.app)",
      accept: "text/html,application/xhtml+xml",
    },
  });

  const body = await response.text();
  return new NextResponse(body, {
    status: response.status,
    headers: {
      "content-type": response.headers.get("content-type") ?? "text/html; charset=utf-8",
      "cache-control": "no-store",
      "x-source-url": SOURCES[sourceKey],
    },
  });
}
