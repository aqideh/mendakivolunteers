export type ReconciliationCandidate = Readonly<{
  id: string;
  display_name: string | null;
  mobile: string | null;
  primary_email_normalized: string | null;
}>;

export function normalizeVolunteerName(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function normalizeVolunteerMobile(value: string | null | undefined) {
  return (value ?? "").replace(/\D/g, "");
}

export function findHighConfidenceIdentityCandidates(
  current: Readonly<{
    displayName: string | null | undefined;
    mobile: string | null | undefined;
    email: string | null | undefined;
  }>,
  candidates: readonly ReconciliationCandidate[],
) {
  const name = normalizeVolunteerName(current.displayName);
  const mobile = normalizeVolunteerMobile(current.mobile);
  const email = (current.email ?? "").trim().toLowerCase();

  if (!name || !mobile) return [];

  return candidates.filter((candidate) => {
    const sameName = normalizeVolunteerName(candidate.display_name) === name;
    const sameMobile = normalizeVolunteerMobile(candidate.mobile) === mobile;
    const candidateEmail = (candidate.primary_email_normalized ?? "")
      .trim()
      .toLowerCase();

    return sameName && sameMobile && candidateEmail !== email;
  });
}
