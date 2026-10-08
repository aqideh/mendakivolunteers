import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";
import { createClient } from "@/lib/supabase/server";

import { CopyManagementSummary } from "./copy-management-summary";
import styles from "./website-analytics.module.css";

export const metadata: Metadata = {
  title: "Website Analytics",
};

export const dynamic = "force-dynamic";

type DailyPoint = Readonly<{
  day: string;
  pageviews: number;
  visitors: number;
  signups: number;
  registrations: number;
  registrants: number;
}>;

type RankedPage = Readonly<{
  path: string;
  pageviews: number;
  visitors: number;
}>;

type RankedSource = Readonly<{
  source: string;
  pageviews: number;
  visitors: number;
}>;

type RankedDevice = Readonly<{
  device: string;
  pageviews: number;
  visitors: number;
}>;

type RankedPathway = Readonly<{
  pathway: string;
  pageviews: number;
  visitors: number;
}>;

type AnalyticsSummary = Readonly<{
  tracking_started_at: string | null;
  daily: DailyPoint[];
  totals: {
    pageviews: number;
    visitors: number;
    signups: number;
    registrations: number;
    registrants: number;
  };
  top_pages: RankedPage[];
  sources: RankedSource[];
  devices: RankedDevice[];
  pathways: RankedPathway[];
}>;

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function parameter(
  params: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

function singaporeDate(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Singapore",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";
  return `${value("year")}-${value("month")}-${value("day")}`;
}

function validDate(value: string | undefined) {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function dateFromSingaporeKey(value: string) {
  return new Date(`${value}T00:00:00+08:00`);
}

function dateKeyFromUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(dateFromSingaporeKey(value));
}

function formatShortDate(value: string) {
  return new Intl.DateTimeFormat("en-SG", {
    day: "numeric",
    month: "short",
  }).format(dateFromSingaporeKey(value));
}

function compactNumber(value: number) {
  return new Intl.NumberFormat("en-SG", {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: value >= 10_000 ? 1 : 0,
  }).format(value);
}

function percentage(numerator: number, denominator: number) {
  if (!denominator) return "—";
  return `${((numerator / denominator) * 100).toFixed(1)}%`;
}

function delta(current: number, previous: number) {
  if (!previous) return current ? "New" : "—";
  const change = ((current - previous) / previous) * 100;
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toFixed(1)}%`;
}

function maxValue(values: number[]) {
  return Math.max(...values, 1);
}

function TrendChart({ daily }: { daily: DailyPoint[] }) {
  const width = 760;
  const height = 250;
  const left = 42;
  const right = 18;
  const top = 18;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;
  const visitorMax = maxValue(daily.map((point) => point.visitors));
  const signupMax = maxValue(daily.map((point) => point.signups));
  const x = (index: number) =>
    left + (daily.length <= 1 ? plotWidth / 2 : (index / (daily.length - 1)) * plotWidth);
  const visitorY = (value: number) =>
    top + plotHeight - (value / visitorMax) * plotHeight;
  const signupHeight = (value: number) => (value / signupMax) * plotHeight * 0.78;
  const line = daily
    .map((point, index) => `${x(index)},${visitorY(point.visitors)}`)
    .join(" ");

  const labelIndexes = daily.length <= 4
    ? daily.map((_, index) => index)
    : [0, Math.floor((daily.length - 1) / 2), daily.length - 1];

  return (
    <div className={styles.chartWrap}>
      <svg
        aria-label="Daily unique visitors and completed sign-ups"
        className={styles.chart}
        role="img"
        viewBox={`0 0 ${width} ${height}`}
      >
        {[0, 0.5, 1].map((ratio) => {
          const y = top + plotHeight - ratio * plotHeight;
          return (
            <g key={ratio}>
              <line
                className={styles.gridLine}
                x1={left}
                x2={width - right}
                y1={y}
                y2={y}
              />
              <text className={styles.axisText} x={left - 8} y={y + 4} textAnchor="end">
                {compactNumber(Math.round(visitorMax * ratio))}
              </text>
            </g>
          );
        })}

        {daily.map((point, index) => {
          const barWidth = Math.max(5, Math.min(14, plotWidth / Math.max(daily.length, 1) - 3));
          const barHeight = signupHeight(point.signups);
          return (
            <rect
              className={styles.signupBar}
              height={barHeight}
              key={point.day}
              rx="2"
              width={barWidth}
              x={x(index) - barWidth / 2}
              y={top + plotHeight - barHeight}
            />
          );
        })}

        {daily.length ? (
          <polyline
            className={styles.visitorLine}
            fill="none"
            points={line}
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        ) : null}

        {labelIndexes.map((index) => {
          const point = daily[index];
          if (!point) return null;
          return (
            <text
              className={styles.axisText}
              key={point.day}
              textAnchor={index === 0 ? "start" : index === daily.length - 1 ? "end" : "middle"}
              x={x(index)}
              y={height - 8}
            >
              {formatShortDate(point.day)}
            </text>
          );
        })}
      </svg>
      <div className={styles.legend}>
        <span><i className={styles.legendLine} /> Unique visitors</span>
        <span><i className={styles.legendBar} /> Completed sign-ups</span>
      </div>
    </div>
  );
}

function HorizontalBars({
  rows,
  valueKey = "visitors",
}: {
  rows: Array<{ label: string; visitors: number; pageviews: number }>;
  valueKey?: "visitors" | "pageviews";
}) {
  const max = maxValue(rows.map((row) => row[valueKey]));
  return (
    <div className={styles.barList}>
      {rows.map((row) => (
        <div className={styles.barRow} key={row.label}>
          <div className={styles.barRowMeta}>
            <strong title={row.label}>{row.label}</strong>
            <span>{compactNumber(row[valueKey])}</span>
          </div>
          <div className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${Math.max(2, (row[valueKey] / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
      {rows.length === 0 ? <p className={styles.empty}>No tracked data in this period.</p> : null}
    </div>
  );
}

export default async function WebsiteAnalyticsPage({ searchParams }: PageProps) {
  const supabase = await createClient();
  const { data: claimsData, error: claimsError } = await supabase.auth.getClaims();
  const userId = claimsData?.claims?.sub;

  if (claimsError || !userId) {
    redirect("/login?next=%2Fadmin%2Fwebsite-analytics");
  }

  const [accountResult, rolesResult] = await Promise.all([
    supabase
      .schema("core")
      .from("user_accounts")
      .select("status")
      .eq("id", userId)
      .maybeSingle(),
    supabase
      .schema("core")
      .from("user_roles")
      .select("role")
      .eq("user_id", userId),
  ]);

  const roles = (rolesResult.data ?? []).map(({ role }) => String(role));
  const canView = roles.includes("admin") || roles.includes("volteam");

  if (
    accountResult.error ||
    rolesResult.error ||
    accountResult.data?.status !== "active" ||
    !canView
  ) {
    redirect("/dashboard");
  }

  const params = await searchParams;
  const today = singaporeDate(new Date());
  const defaultStartDate = new Date(`${today}T00:00:00+08:00`);
  defaultStartDate.setDate(defaultStartDate.getDate() - 29);
  const defaultStart = singaporeDate(defaultStartDate);

  const requestedStart = parameter(params, "start");
  const requestedEnd = parameter(params, "end");
  let start = validDate(requestedStart) ? requestedStart! : defaultStart;
  let end = validDate(requestedEnd) ? requestedEnd! : today;

  if (start > end) [start, end] = [end, start];

  const startDate = dateFromSingaporeKey(start);
  const endDate = dateFromSingaporeKey(end);
  const rangeDays = Math.max(
    1,
    Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
  );
  const previousEndDate = new Date(startDate.getTime() - 86_400_000);
  const previousStartDate = new Date(previousEndDate.getTime() - (rangeDays - 1) * 86_400_000);
  const previousStart = dateKeyFromUtc(previousStartDate);
  const previousEnd = dateKeyFromUtc(previousEndDate);

  const admin = getPhaseOneAdminClient();
  const [currentResult, previousResult] = await Promise.all([
    admin.schema("core").rpc("website_analytics_summary", {
      p_start: start,
      p_end: end,
    }),
    admin.schema("core").rpc("website_analytics_summary", {
      p_start: previousStart,
      p_end: previousEnd,
    }),
  ]);

  if (currentResult.error || previousResult.error) {
    console.error("Unable to load website analytics", {
      current: currentResult.error?.code,
      previous: previousResult.error?.code,
    });
    throw new Error("Website analytics could not be loaded");
  }

  const summary = currentResult.data as AnalyticsSummary;
  const previous = previousResult.data as AnalyticsSummary;
  const visitorConversion = percentage(summary.totals.signups, summary.totals.visitors);
  const registrationConversion = percentage(
    summary.totals.registrants,
    summary.totals.visitors,
  );

  const summaryText = [
    `Keluarga MENDAKI website performance — ${formatDate(start)} to ${formatDate(end)}`,
    `Unique visitors: ${summary.totals.visitors.toLocaleString("en-SG")} (${delta(summary.totals.visitors, previous.totals.visitors)} vs previous period)`,
    `Completed sign-ups: ${summary.totals.signups.toLocaleString("en-SG")} (${delta(summary.totals.signups, previous.totals.signups)} vs previous period)`,
    `Opportunity registrations: ${summary.totals.registrations.toLocaleString("en-SG")} across ${summary.totals.registrants.toLocaleString("en-SG")} unique volunteers`,
    `Visitor-to-sign-up indicator: ${visitorConversion}`,
    `Visitor-to-registrant indicator: ${registrationConversion}`,
  ].join("\n");

  const trackingStarted = summary.tracking_started_at
    ? new Intl.DateTimeFormat("en-SG", {
        day: "numeric",
        month: "short",
        year: "numeric",
        timeZone: "Asia/Singapore",
      }).format(new Date(summary.tracking_started_at))
    : null;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div>
          <p className={styles.eyebrow}>Website performance</p>
          <h1>Website analytics</h1>
          <p className={styles.subtitle}>
            A compact management view of reach, acquisition and conversion.
          </p>
        </div>
        <div className={styles.actions}>
          <CopyManagementSummary text={summaryText} />
          <Link
            className={styles.primaryButton}
            href={`/admin/website-analytics/export?start=${start}&end=${end}`}
          >
            Export CSV
          </Link>
        </div>
      </header>

      <form className={styles.filters}>
        <div className={styles.presetLinks} aria-label="Date presets">
          <Link href="/admin/website-analytics?range=7">7 days</Link>
          <Link href="/admin/website-analytics">30 days</Link>
          <Link
            href={`/admin/website-analytics?start=${today.slice(0, 4)}-01-01&end=${today}`}
          >
            This year
          </Link>
        </div>
        <label>
          <span>From</span>
          <input defaultValue={start} name="start" type="date" />
        </label>
        <label>
          <span>To</span>
          <input defaultValue={end} name="end" type="date" />
        </label>
        <button type="submit">Apply</button>
      </form>

      {trackingStarted && start < summary.tracking_started_at.slice(0, 10) ? (
        <div className={styles.notice}>
          Visitor tracking began on <strong>{trackingStarted}</strong>. Sign-ups and
          registrations before that date remain complete, but visitor metrics do not.
        </div>
      ) : null}

      <section className={styles.kpis} aria-label="Website KPI summary">
        <article>
          <span>Unique visitors</span>
          <strong>{summary.totals.visitors.toLocaleString("en-SG")}</strong>
          <small>{delta(summary.totals.visitors, previous.totals.visitors)} vs previous period</small>
        </article>
        <article>
          <span>Completed sign-ups</span>
          <strong>{summary.totals.signups.toLocaleString("en-SG")}</strong>
          <small>{delta(summary.totals.signups, previous.totals.signups)} vs previous period</small>
        </article>
        <article>
          <span>Opportunity registrations</span>
          <strong>{summary.totals.registrations.toLocaleString("en-SG")}</strong>
          <small>{summary.totals.registrants.toLocaleString("en-SG")} unique volunteers</small>
        </article>
        <article>
          <span>Visitor → sign-up</span>
          <strong>{visitorConversion}</strong>
          <small>Period-level conversion indicator</small>
        </article>
      </section>

      <section className={styles.mainGrid}>
        <article className={styles.panelWide}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Traffic & sign-ups</h2>
              <p>{formatDate(start)} — {formatDate(end)}</p>
            </div>
            <span>{compactNumber(summary.totals.pageviews)} pageviews</span>
          </div>
          <TrendChart daily={summary.daily} />
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2>Conversion indicators</h2>
              <p>Same-period activity</p>
            </div>
          </div>
          <div className={styles.funnel}>
            <div>
              <span>Unique visitors</span>
              <strong>{summary.totals.visitors.toLocaleString("en-SG")}</strong>
            </div>
            <div>
              <span>Completed sign-ups</span>
              <strong>{summary.totals.signups.toLocaleString("en-SG")}</strong>
              <small>{visitorConversion} of visitors</small>
            </div>
            <div>
              <span>Unique registrants</span>
              <strong>{summary.totals.registrants.toLocaleString("en-SG")}</strong>
              <small>{registrationConversion} of visitors</small>
            </div>
          </div>
        </article>
      </section>

      <section className={styles.secondaryGrid}>
        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><h2>Pathway interest</h2><p>Unique visitors</p></div>
          </div>
          <HorizontalBars
            rows={summary.pathways.map((row) => ({
              label: row.pathway,
              visitors: row.visitors,
              pageviews: row.pageviews,
            }))}
          />
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><h2>Acquisition</h2><p>Top sources by visitor count</p></div>
          </div>
          <HorizontalBars
            rows={summary.sources.map((row) => ({
              label: row.source,
              visitors: row.visitors,
              pageviews: row.pageviews,
            }))}
          />
        </article>

        <article className={styles.panel}>
          <div className={styles.panelHeading}>
            <div><h2>Devices</h2><p>Unique visitors</p></div>
          </div>
          <HorizontalBars
            rows={summary.devices.map((row) => ({
              label: row.device.charAt(0).toUpperCase() + row.device.slice(1),
              visitors: row.visitors,
              pageviews: row.pageviews,
            }))}
          />
        </article>
      </section>

      <section className={styles.tablePanel}>
        <div className={styles.panelHeading}>
          <div>
            <h2>Top pages</h2>
            <p>Useful for identifying content that is attracting attention.</p>
          </div>
        </div>
        <div className={styles.tableWrap}>
          <table>
            <thead>
              <tr>
                <th>Page</th>
                <th>Unique visitors</th>
                <th>Pageviews</th>
                <th>Views / visitor</th>
              </tr>
            </thead>
            <tbody>
              {summary.top_pages.map((row) => (
                <tr key={row.path}>
                  <td><code>{row.path}</code></td>
                  <td>{row.visitors.toLocaleString("en-SG")}</td>
                  <td>{row.pageviews.toLocaleString("en-SG")}</td>
                  <td>{row.visitors ? (row.pageviews / row.visitors).toFixed(1) : "—"}</td>
                </tr>
              ))}
              {summary.top_pages.length === 0 ? (
                <tr><td colSpan={4}>No tracked pageviews in this period.</td></tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </section>

      <footer className={styles.methodNote}>
        <strong>Reporting note.</strong> A “sign-up” is counted when volunteer onboarding
        is completed, not when an authentication record is first created. Visitor IDs are
        random first-party identifiers; Keluarga does not store IP addresses, raw user-agent
        strings or full referrer URLs in this analytics dataset.
      </footer>
    </div>
  );
}
