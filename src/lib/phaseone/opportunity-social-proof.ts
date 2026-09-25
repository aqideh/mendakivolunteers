import "server-only";

import { getPhaseOneAdminClient } from "@/lib/phaseone/admin";

export type OpportunitySocialProof = Readonly<{
  confirmedCount: number;
  avatarUrls: string[];
}>;

export async function loadOpportunitySocialProof(
  eventIds: readonly string[],
  includeAvatars: boolean,
) {
  const result = new Map<string, OpportunitySocialProof>(
    eventIds.map((id) => [id, { confirmedCount: 0, avatarUrls: [] }]),
  );
  if (!eventIds.length) return result;

  const admin = getPhaseOneAdminClient();
  const registrations = await admin
    .from("keluarga_registrations")
    .select("event_id, volunteer_id, submitted_at")
    .in("event_id", [...eventIds])
    .eq("status", "confirmed")
    .order("submitted_at", { ascending: true });

  if (registrations.error) {
    console.error("Unable to load opportunity registrations", {
      code: registrations.error.code,
    });
    return result;
  }

  for (const row of registrations.data ?? []) {
    const current = result.get(row.event_id) ?? { confirmedCount: 0, avatarUrls: [] };
    result.set(row.event_id, {
      ...current,
      confirmedCount: current.confirmedCount + 1,
    });
  }

  if (!includeAvatars || !registrations.data?.length) return result;

  const volunteerIds = Array.from(
    new Set(registrations.data.map((row) => row.volunteer_id)),
  );
  const profiles = await admin
    .from("keluarga_volunteer_profiles")
    .select("volunteer_id, avatar_path")
    .in("volunteer_id", volunteerIds)
    .eq("event_card_photo_opt_in", true)
    .not("avatar_path", "is", null);

  if (profiles.error) {
    console.error("Unable to load opted-in opportunity avatars", {
      code: profiles.error.code,
    });
    return result;
  }

  const avatarPathByVolunteer = new Map<string, string>();
  for (const profile of profiles.data ?? []) {
    if (profile.avatar_path) {
      avatarPathByVolunteer.set(profile.volunteer_id, profile.avatar_path);
    }
  }

  const paths = Array.from(new Set(avatarPathByVolunteer.values()));
  if (!paths.length) return result;

  const signed = await admin.storage
    .from("volunteer-profile-photos")
    .createSignedUrls(paths, 15 * 60);

  if (signed.error) {
    console.error("Unable to sign opportunity avatars", {
      message: signed.error.message,
    });
    return result;
  }

  const signedByPath = new Map<string, string>();
  for (const item of signed.data ?? []) {
    if (item.path && item.signedUrl) signedByPath.set(item.path, item.signedUrl);
  }

  for (const eventId of eventIds) {
    const current = result.get(eventId);
    if (!current) continue;
    const avatarUrls = (registrations.data ?? [])
      .filter((row) => row.event_id === eventId)
      .map((row) => avatarPathByVolunteer.get(row.volunteer_id))
      .filter((path): path is string => Boolean(path))
      .map((path) => signedByPath.get(path))
      .filter((url): url is string => Boolean(url))
      .slice(0, 4);
    result.set(eventId, { ...current, avatarUrls });
  }

  return result;
}
