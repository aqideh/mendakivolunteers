import { cookies } from "next/headers";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PackageActionPinForm } from "@/components/phaseone/package-action-pin-form";
import { PortalHeader } from "@/components/portal-header";
import { formatSingaporeDateTime } from "@/lib/content/dates";
import { getPhaseOneAdminClient, getPhaseOneServerSecret } from "@/lib/phaseone/admin";
import { evaluateBriefingAccess } from "@/lib/phaseone/package-briefing";
import {
  getPackageActionPin,
  hasPackageActionAccess,
  packageActionCookieName,
  packageActionLabel,
  readPackageActionAccessToken,
  type PackageAction,
} from "@/lib/phaseone/package-action-access";

import styles from "./package-detail.module.css";

export const dynamic = "force-dynamic";

type PackagePageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ access?: string; action?: string }>;
};

const actions: PackageAction[] = ["sign-in", "sign-out"];

export default async function PackagePage({ params, searchParams }: PackagePageProps) {
  const { slug } = await params;
  const { access, action: actionParam } = await searchParams;
  const supabase = getPhaseOneAdminClient();
  const { data: volunteerPackage, error } = await supabase
    .from("phaseone_events")
    .select(
      "id, title, reporting_at, venue, briefing_url, briefing_available_at, sign_in_pin_salt, sign_in_pin_hash, sign_in_pin_updated_at, sign_out_pin_salt, sign_out_pin_hash, sign_out_pin_updated_at",
    )
    .eq("slug", slug)
    .eq("is_published", true)
    .maybeSingle();

  if (error) {
    console.error("Unable to load volunteer package", { code: error.code, slug });
    throw new Error("Volunteer package details could not be loaded");
  }
  if (!volunteerPackage) notFound();

  const briefing = evaluateBriefingAccess({
    isPublished: true,
    briefingUrl: volunteerPackage.briefing_url,
    briefingAvailableAt: volunteerPackage.briefing_available_at,
  });

  const cookieStore = await cookies();
  const secret = getPhaseOneServerSecret();
  const actionStates = actions.map((action) => {
    const configuredPin = getPackageActionPin(volunteerPackage, action);
    const claims = readPackageActionAccessToken(
      cookieStore.get(packageActionCookieName(volunteerPackage.id, action))?.value,
      secret,
    );
    return {
      action,
      configured: Boolean(configuredPin),
      unlocked: Boolean(
        configuredPin &&
          hasPackageActionAccess(
            claims,
            volunteerPackage.id,
            action,
            configuredPin.updatedAt,
          ),
      ),
    };
  });

  const errorAction = actions.includes(actionParam as PackageAction)
    ? (actionParam as PackageAction)
    : null;

  return (
    <div className="site-shell phaseone-shell">
      <PortalHeader status="Volunteer package" lite />
      <main className="phaseone-frame">
        <Link className="back-link" href="/packages">
          ← Packages
        </Link>
        <article className={styles.card}>
          <p className="phaseone-opportunity-date">Volunteer event package</p>
          <h1>{volunteerPackage.title}</h1>
          <dl className="phaseone-opportunity-details">
            <div>
              <dt>Report</dt>
              <dd>
                {volunteerPackage.reporting_at
                  ? formatSingaporeDateTime(volunteerPackage.reporting_at)
                  : "Check with the event team"}
              </dd>
            </div>
            <div>
              <dt>Venue</dt>
              <dd>{volunteerPackage.venue ?? "Check with the event team"}</dd>
            </div>
          </dl>

          {briefing.available ? (
            <a
              className={`button button-primary ${styles.briefing}`}
              href={`/api/phaseone/packages/${slug}/go/briefing`}
              target="_blank"
              rel="noopener noreferrer"
            >
              View briefing
            </a>
          ) : (
            <button
              className={`button ${styles.briefing} ${styles.briefingDisabled}`}
              type="button"
              disabled
            >
              Briefing not started
            </button>
          )}

          {access === "expired" && errorAction ? (
            <p className="phaseone-form-error" role="alert">
              Your {packageActionLabel(errorAction).toLowerCase()} access expired. Enter that PIN again.
            </p>
          ) : null}
          {access === "unavailable" && errorAction ? (
            <p className="phaseone-form-error" role="alert">
              {packageActionLabel(errorAction)} has not been configured yet.
            </p>
          ) : null}

          <div className={styles.actionGrid}>
            {actionStates.map(({ action, configured, unlocked }) => (
              <section className={`panel ${styles.actionPanel}`} key={action}>
                <h2>{packageActionLabel(action)}</h2>
                {!configured ? (
                  <p>This action has not been enabled by the event team.</p>
                ) : unlocked ? (
                  <>
                    <a
                      className="button button-primary"
                      href={`/api/phaseone/packages/${slug}/go/${action}`}
                    >
                      Open {packageActionLabel(action).toLowerCase()}
                    </a>
                    <p className="phaseone-access-note">
                      Access remains valid for five minutes or until this PIN changes.
                    </p>
                  </>
                ) : (
                  <PackageActionPinForm slug={slug} action={action} />
                )}
              </section>
            ))}
          </div>
        </article>
      </main>
    </div>
  );
}
