import { NextResponse } from "next/server";

const SOURCES = {
  list: "https://professionalnetworksuat.mendaki.org.sg/pn-sector/PN_Sector__c/Portal_Dislay_Active_PN_Sectors",
  aerospace:
    "https://professionalnetworksuat.mendaki.org.sg/pn-sector/a2W85000000BdPREA0/aerospace-and-aviation",
} as const;

export const dynamic = "force-dynamic";

function extract(html: string) {
  const text = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

  const urls = Array.from(
    new Set(
      (html.match(/https?:\\?\/\\?\/[^"'<>\s)]+/g) ?? [])
        .map((value) => value.replace(/\\\//g, "/"))
        .filter((value) =>
          /pn-sector|linkedin|file\.force|cms\/delivery|salesforce/i.test(value),
        ),
    ),
  ).slice(0, 250);

  const ids = Array.from(new Set(html.match(/a2W[A-Za-z0-9]{12,15}/g) ?? [])).slice(0, 100);
  const keywords = [
    "A fraternity",
    "Core Team",
    "Aerospace",
    "Aviation",
    "Banking",
    "Finance",
    "Early Childhood",
    "Engineering",
    "Technology",
    "Tech",
  ];
  const snippets = keywords.flatMap((keyword) => {
    const lowered = html.toLowerCase();
    const needle = keyword.toLowerCase();
    const output: string[] = [];
    let from = 0;
    while (output.length < 8) {
      const index = lowered.indexOf(needle, from);
      if (index < 0) break;
      output.push(html.slice(Math.max(0, index - 500), index + 1000));
      from = index + needle.length;
    }
    return output.map((snippet) => ({ keyword, snippet }));
  });

  return { text: text.slice(0, 12000), urls, ids, snippets };
}

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
  return NextResponse.json({
    source: SOURCES[sourceKey],
    status: response.status,
    ...extract(body),
  });
}
