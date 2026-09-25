import type { SupabaseClient } from "@supabase/supabase-js";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PortalHeader } from "@/components/portal-header";
import { requireActiveAccount } from "@/lib/auth/account-access";

export const metadata: Metadata = {
  title: "Edit profile",
};

export const dynamic = "force-dynamic";

type PageProps = Readonly<{
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}>;

function parameter(
  values: Record<string, string | string[] | undefined>,
  key: string,
) {
  const value = values[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ProfileEditPage({ searchParams }: PageProps) {
  const { supabase, userId } = await requireActiveAccount("/profile/edit");
  const client = supabase as unknown as SupabaseClient;

  const volunteerResult = await client
    .schema("core")
    .from("volunteers")
    .select("id")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (volunteerResult.error || !volunteerResult.data) {
    redirect("/dashboard?error=profile_update_failed");
  }

  const parameters = await searchParams;
  const success = parameter(parameters, "success");

  const sections = [
    ["contact", "Contact details", "Name and mobile number"],
    ["home", "Home area", "Postal code and address"],
    ["personal", "Personal details", "Birthday, languages and emergency contact"],
    ["interests", "Volunteering interests", "Causes and areas you want to support"],
    ["skills", "Skills", "Skills you can contribute"],
    ["availability", "Availability", "Typical availability and commitment"],
    ["event-readiness", "Event readiness", "Dietary needs, allergies and T-shirt size"],
    ["education", "Education", "Highest qualification and education background"],
    ["photo", "Profile photo", "Change just your profile photo"],
    ["about", "About you", "Optional introduction"],
  ] as const;

  return (
    <div className="site-shell profile-setup-shell">
      <PortalHeader status="Edit profile" dashboard />
      <main className="page-frame profile-edit-page">
        <div className="profile-edit-header">
          <Link className="back-link" href="/dashboard">← Back to profile</Link>
          <h1>Profile details</h1>
          <p className="muted">
            Update only the information you want to change. You do not need to repeat profile setup.
          </p>
        </div>

        {success ? (
          <div className="notice notice-success" role="status">
            Your profile has been updated.
          </div>
        ) : null}

        <div className="profile-edit-section-list">
          {sections.map(([step, title, description]) => (
            <Link
              href={`/profile/setup?step=${step}&mode=edit`}
              key={step}
            >
              <span>
                <strong>{title}</strong>
                <small>{description}</small>
              </span>
              <span aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      </main>
    </div>
  );
}
