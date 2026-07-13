const DEFAULT_REDIRECT = "/dashboard";

export function getSafeRedirectPath(
  candidate: string | null | undefined,
  fallback = DEFAULT_REDIRECT,
): string {
  if (!candidate || !candidate.startsWith("/") || candidate.startsWith("//")) {
    return fallback;
  }

  if (candidate.includes("\\") || /[\u0000-\u001F\u007F]/.test(candidate)) {
    return fallback;
  }

  try {
    const base = new URL("https://local.invalid");
    const parsed = new URL(candidate, base);

    if (parsed.origin !== base.origin) {
      return fallback;
    }

    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch {
    return fallback;
  }
}
