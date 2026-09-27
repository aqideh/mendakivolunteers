import type { Metadata } from "next";
import Link from "next/link";

import {
  LandingPagePhotoManager,
  type LandingPagePhotoItem,
} from "@/components/landing-page-photo-manager";
import { PortalHeader } from "@/components/portal-header";
import { requireContentManager } from "@/lib/auth/content-access";
import { getLandingPageMedia } from "@/lib/content/landing-page-media";

export const metadata: Metadata = {
  title: "Landing page photos",
};

export const dynamic = "force-dynamic";

export default async function LandingPagePhotosAdminPage() {
  await requireContentManager({ next: "/admin/content/landing-pages" });

  const media = await getLandingPageMedia();
  const pages: LandingPagePhotoItem[] = media.map((item) => ({
    key: item.key,
    label: item.label,
    href: item.href,
    imageUrl: item.imageUrl,
    isCustom: Boolean(item.storagePath),
  }));

  return (
    <div className="site-shell">
      <PortalHeader status="Landing page photos" dashboard />
      <main className="page-frame">
        <div className="dashboard-header">
          <div>
            <Link className="text-link" href="/admin">← Admin</Link>
            <h1>Landing page photos</h1>
            <p className="muted">
              Upload and set the hero photo used on Home and each of the five
              volunteer landing pages.
            </p>
          </div>
        </div>

        <section className="section" aria-label="Landing page photo settings">
          <LandingPagePhotoManager pages={pages} />
          <p className="form-help">
            JPEG, PNG and WebP files up to 20 MB are stored unchanged at their
            original resolution. The page crops them visually to fill the hero area.
          </p>
        </section>
      </main>
    </div>
  );
}
