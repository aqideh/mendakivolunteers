import { NextResponse } from "next/server";

const BASE = "https://professionalnetworksuat.mendaki.org.sg";
const SOURCES = {
  list: `${BASE}/pn-sector/PN_Sector__c/Portal_Dislay_Active_PN_Sectors`,
  aerospace: `${BASE}/pn-sector/a2W85000000BdPREA0/aerospace-and-aviation`,
} as const;

export const dynamic = "force-dynamic";

async function fetchText(url: string) {
  const response = await fetch(url, {
    cache: "no-store",
    redirect: "follow",
    headers: {
      "user-agent":
        "Mozilla/5.0 (compatible; KeluargaMENDAKIStagingImporter/1.0; +https://keluargastaging.vercel.app)",
      accept: "text/html,application/javascript,text/javascript,*/*",
    },
  });
  return { response, body: await response.text() };
}

function importViews(html: string): Record<string, string> {
  const matches = Array.from(
    html.matchAll(/\\?"@view\/([^"\\]+)\\?"\s*:\s*\\?"([^"\\]+)\\?"/g),
  );
  return Object.fromEntries(
    matches.flatMap((match) => {
      const name = match[1];
      const path = match[2];
      return name && path ? [[name, path.replace(/\\\//g, "/")] as const] : [];
    }),
  );
}

function inspect(body: string) {
  const decoded = body
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\\//g, "/");

  const keywords = [
    "A fraternity",
    "Core Team",
    "Aerospace",
    "Aviation",
    "Description",
    "linkedin",
    "Image",
    "PN_Sector",
  ];

  const snippets = keywords.flatMap((keyword) => {
    const lower = decoded.toLowerCase();
    const needle = keyword.toLowerCase();
    const rows: string[] = [];
    let from = 0;
    while (rows.length < 20) {
      const index = lower.indexOf(needle, from);
      if (index < 0) break;
      rows.push(decoded.slice(Math.max(0, index - 800), index + 1800));
      from = index + needle.length;
    }
    return rows.map((snippet) => ({ keyword, snippet }));
  });

  const media = Array.from(
    new Set(
      (decoded.match(/(?:https?:\/\/[^"'<>\s)]+|\/sfsites\/c\/cms\/delivery\/media\/[A-Za-z0-9?=&._-]+)/g) ?? [])
        .filter((value) => /cms\/delivery|file\.force|image|media/i.test(value)),
    ),
  ).slice(0, 200);

  const apexModules = Array.from(
    new Set(decoded.match(/@salesforce\/apex\/[A-Za-z0-9_.]+/g) ?? []),
  );
  const fieldNames = Array.from(
    new Set(decoded.match(/[A-Za-z][A-Za-z0-9_]*__c/g) ?? []),
  ).filter((value) =>
    /PN|Sector|Description|Image|Photo|LinkedIn|Role|Designation|Organisation|Display|Email|Name/i.test(value),
  );

  const adapterSnippets = ["wiredCoreTeamMembers", "wiredPNSector", "getCoreTeam", "getPNSector", "getApexInvoker", "/apex", "ldsAdaptersApex"]
    .flatMap((needle) => {
      const rows: string[] = [];
      let from = 0;
      while (rows.length < 8) {
        const index = decoded.indexOf(needle, from);
        if (index < 0) break;
        rows.push(decoded.slice(Math.max(0, index - 2500), index + 3000));
        from = index + needle.length;
      }
      return rows.map((snippet) => ({ needle, snippet }));
    });

  const apexTransportStrings = Array.from(
    new Set(
      (decoded.match(/["'`]([^"'\`]{0,160}(?:apex|Apex)[^"'\`]{0,220})["'`]/g) ?? [])
        .map((value) => value.slice(1, -1))
        .filter((value) => /api|execute|action|invoke|apex/i.test(value)),
    ),
  ).slice(0, 200);

  return { snippets, media, apexModules, fieldNames, adapterSnippets, apexTransportStrings };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const sourceKey = url.searchParams.get("source");
  if (sourceKey !== "list" && sourceKey !== "aerospace") {
    return NextResponse.json({ error: "Unsupported source" }, { status: 400 });
  }

  const { response, body } = await fetchText(SOURCES[sourceKey]);
  const views = importViews(body);
  const viewName = url.searchParams.get("view");

  if (viewName) {
    const viewPath = views[viewName];
    if (!viewPath) {
      return NextResponse.json({ error: "View not found", views }, { status: 404 });
    }
    const viewUrl = new URL(viewPath, BASE).toString();
    const fetched = await fetchText(viewUrl);
    return NextResponse.json({
      source: SOURCES[sourceKey],
      viewName,
      viewUrl,
      status: fetched.response.status,
      ...inspect(fetched.body),
      body: fetched.body.slice(0, 40000),
    });
  }

  return NextResponse.json({
    source: SOURCES[sourceKey],
    status: response.status,
    views,
    ...inspect(body),
  });
}
