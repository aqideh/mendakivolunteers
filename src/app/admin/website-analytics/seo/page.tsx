import type { Metadata } from "next";
import Link from "next/link";

import { requireContentManager } from "@/lib/auth/content-access";
import { getEditableSeoOverrides } from "@/lib/seo-content";
import { checkLiveSitemap, getSearchConsoleReport, inspectGoogleIndex, isSearchConsoleConfigured } from "@/lib/google-search-console";
import { EDITABLE_SEO_PAGES, SITE_URL } from "@/lib/seo";

import { saveSeoMetadata } from "./actions";
import styles from "./seo.module.css";

export const metadata: Metadata = { title: "Search & SEO" };
export const dynamic = "force-dynamic";

type PageProps = { searchParams: Promise<{ saved?: string; inspect?: string }> };

function count(value: number) {
  return new Intl.NumberFormat("en-SG").format(value);
}

export default async function SeoConsolePage({ searchParams }: PageProps) {
  await requireContentManager({ next: "/admin/website-analytics/seo" });
  const params = await searchParams;
  const [overrides, sitemapResult] = await Promise.all([
    getEditableSeoOverrides(),
    checkLiveSitemap().then((value) => ({ value, error: null as string | null }))
      .catch(() => ({ value: null, error: "The live sitemap could not be reached." })),
  ]);
  const byPath = new Map(overrides.map((row) => [row.path, row]));
  const configured = isSearchConsoleConfigured();
  const report = configured
    ? await getSearchConsoleReport().then((value) => ({ value, error: null as string | null }))
        .catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : "Search Console is unavailable." }))
    : { value: null, error: null };
  const inspect = typeof params.inspect === "string" ? params.inspect : "";
  const inspection = configured && report.value && EDITABLE_SEO_PAGES.some((page) => page.path === inspect)
    ? await inspectGoogleIndex(inspect).then((value) => ({ value, error: null as string | null }))
        .catch((error: unknown) => ({ value: null, error: error instanceof Error ? error.message : "Google URL inspection failed." }))
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Website performance</p>
          <h1>Search &amp; SEO</h1>
          <p className={styles.subtitle}>Search visibility, technical health and public-page search snippets in one place.</p>
        </div>
        <Link className={styles.secondaryButton} href="/admin/website-analytics">Website Analytics</Link>
      </header>

      <nav aria-label="Website performance sections" className={styles.tabs}>
        <Link href="/admin/website-analytics">Analytics</Link>
        <Link aria-current="page" className={styles.selectedTab} href="/admin/website-analytics/seo">Search &amp; SEO</Link>
      </nav>

      <section className={styles.grid} aria-label="SEO checks">
        <article className={styles.panel}>
          <p className={styles.label}>Live sitemap</p>
          <strong>{sitemapResult.value?.ok ? "Available" : "Needs attention"}</strong>
          <p>{sitemapResult.value?.ok ? count(sitemapResult.value.count) + " published URLs listed" : sitemapResult.error ?? "HTTP " + (sitemapResult.value?.status ?? "unknown")}</p>
          <a href={SITE_URL + "/sitemap.xml"} target="_blank" rel="noreferrer">Open sitemap ↗</a>
        </article>
        <article className={styles.panel}>
          <p className={styles.label}>Indexing controls</p>
          <strong>Configured</strong>
          <p>Public pages have canonical URLs. Account, staff and administration pages are excluded from search.</p>
          <a href={SITE_URL + "/robots.txt"} target="_blank" rel="noreferrer">Open robots.txt ↗</a>
        </article>
        <article className={styles.panel}>
          <p className={styles.label}>Google Search Console</p>
          <strong>{!configured ? "Not connected" : report.value ? "Connected" : "Needs attention"}</strong>
          <p>{!configured ? "MENDAKI must grant access to a Google service account for this property." : report.error ?? "Read-only search performance data is available below."}</p>
          <a href="https://search.google.com/search-console" target="_blank" rel="noreferrer">Open Google Search Console ↗</a>
        </article>
      </section>

      {report.value ? (
        <>
          <section className={styles.panel}>
            <div className={styles.sectionHead}>
              <div><h2>Google organic search</h2><p>{report.value.dates.from} to {report.value.dates.through} · finalised data</p></div>
              <span className={styles.muted}>Search Console data usually trails real time</span>
            </div>
            <div className={styles.metrics}>
              <div><span>Clicks</span><strong>{count(report.value.totals.clicks)}</strong></div>
              <div><span>Impressions</span><strong>{count(report.value.totals.impressions)}</strong></div>
              <div><span>CTR</span><strong>{(report.value.totals.ctr * 100).toFixed(1)}%</strong></div>
              <div><span>Avg. position</span><strong>{report.value.totals.position ? report.value.totals.position.toFixed(1) : "—"}</strong></div>
            </div>
            <p className={styles.muted}>{report.value.sitemap
              ? "Google sitemap: " + (report.value.sitemap.errors === "0" ? "submitted" : "reported errors: " + (report.value.sitemap.errors ?? "unknown"))
              : "The sitemap has not been found in this Search Console property. Submit the live sitemap in Google Search Console."}</p>
          </section>
          <div className={styles.gridTwo}>
            <section className={styles.panel}>
              <h2>Top Google searches</h2>
              <div className={styles.tableWrap}><table><thead><tr><th>Search query</th><th>Clicks</th><th>Impressions</th><th>Position</th></tr></thead><tbody>
                {report.value.queries.map((row) => <tr key={row.keyword}><td>{row.keyword}</td><td>{count(row.clicks)}</td><td>{count(row.impressions)}</td><td>{row.position.toFixed(1)}</td></tr>)}
                {!report.value.queries.length ? <tr><td colSpan={4}>No search queries were reported for this period.</td></tr> : null}
              </tbody></table></div>
            </section>
            <section className={styles.panel}>
              <h2>Pages found in Google Search</h2>
              <div className={styles.tableWrap}><table><thead><tr><th>Page</th><th>Clicks</th><th>Impressions</th><th>Position</th></tr></thead><tbody>
                {report.value.pages.map((row) => <tr key={row.url}><td><a href={row.url} target="_blank" rel="noreferrer">{row.url.replace(SITE_URL, "") || "/"}</a></td><td>{count(row.clicks)}</td><td>{count(row.impressions)}</td><td>{row.position.toFixed(1)}</td></tr>)}
                {!report.value.pages.length ? <tr><td colSpan={4}>No pages were reported for this period.</td></tr> : null}
              </tbody></table></div>
            </section>
          </div>
        </>
      ) : (
        <section className={styles.panel}>
          <h2>Connect Google Search Console</h2>
          <p>Google search impressions, clicks, queries and indexing status require verified property access. No estimated or fabricated traffic is shown.</p>
          <p>MENDAKI's Google property owner should add a read-only service account to the URL-prefix property <code>{SITE_URL + "/"}</code>, enable the Search Console API and URL Inspection API, then configure the three secure Vercel environment variables:</p>
          <p><code>GOOGLE_SEARCH_CONSOLE_CLIENT_EMAIL</code>, <code>GOOGLE_SEARCH_CONSOLE_PRIVATE_KEY</code>, <code>GOOGLE_SEARCH_CONSOLE_SITE_URL</code>.</p>
          <p>Set the property URL to <code>{SITE_URL + "/"}</code>. The service account key must stay in server-side environment variables, never in the application or the admin form.</p>
        </section>
      )}

      {report.value ? (
        <section className={styles.panel}>
          <h2>Google index status</h2>
          <p className={styles.muted}>Inspect an approved public page; this checks Google's last known status, not instant indexing.</p>
          <div className={styles.inspectLinks}>
            {EDITABLE_SEO_PAGES.map((page) => <Link key={page.path} href={"/admin/website-analytics/seo?inspect=" + encodeURIComponent(page.path)}>{page.label}</Link>)}
          </div>
          {inspection?.error ? <p role="alert">{inspection.error}</p> : null}
          {inspection?.value ? <p><strong>{inspection.value.url}</strong> · {inspection.value.verdict} · {inspection.value.coverage}. Last crawl: {inspection.value.lastCrawl ?? "not reported"}. Google canonical: {inspection.value.googleCanonical ?? "not reported"}.</p> : null}
        </section>
      ) : null}

      <section className={styles.panel}>
        <div className={styles.sectionHead}>
          <div><h2>Page titles &amp; descriptions</h2><p>Adjust Google search snippets for Keluarga's eight main public pages.</p></div>
        </div>
        {params.saved && EDITABLE_SEO_PAGES.some((page) => page.path === params.saved) ? <p className={styles.notice} role="status">SEO metadata saved for {params.saved}.</p> : null}
        <div className={styles.editorList}>
          {EDITABLE_SEO_PAGES.map((page) => {
            const saved = byPath.get(page.path);
            return (
              <form key={page.path} action={saveSeoMetadata} className={styles.editor}>
                <input type="hidden" name="path" value={page.path} />
                <div className={styles.editorHead}><div><strong>{page.label}</strong><span>{page.path}</span></div><a href={SITE_URL + page.path} target="_blank" rel="noreferrer">View public page ↗</a></div>
                <label>Search title<input type="text" name="title" defaultValue={saved?.title ?? page.title} minLength={10} maxLength={80} required /></label>
                <label>Meta description<textarea name="description" rows={2} defaultValue={saved?.description ?? page.description} minLength={30} maxLength={240} required /></label>
                <div className={styles.editorActions}><small>{saved ? "Customised · updated " + new Date(saved.updated_at).toLocaleDateString("en-SG") : "Using default metadata"}</small><button type="submit">Save SEO text</button></div>
              </form>
            );
          })}
        </div>
      </section>
    </div>
  );
}
