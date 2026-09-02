import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";

import { authorizeEventGuideSlug } from "@/lib/phaseone/event-guide-access";

type EventGuideLayoutProps = Readonly<{
  children: ReactNode;
  params: Promise<{ slug: string }>;
}>;

export default async function EventGuideLayout({
  children,
  params,
}: EventGuideLayoutProps) {
  const { slug } = await params;
  const authorization = await authorizeEventGuideSlug(slug, {
    requirePublished: false,
  });

  if (authorization.state === "signed_out") {
    redirect(
      `/login?next=${encodeURIComponent(`/journey/${slug}`)}`,
    );
  }
  if (authorization.state === "inactive") {
    redirect("/login?error=account_inactive");
  }
  if (authorization.state === "unavailable") {
    throw new Error("Event Guide access could not be verified");
  }
  if (authorization.state === "not_found") {
    notFound();
  }
  if (authorization.state === "not_registered") {
    redirect("/journey?error=not_registered");
  }

  return children;
}
