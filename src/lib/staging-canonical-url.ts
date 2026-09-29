export function buildCanonicalStagingRedirectUrl(
  requestUrl: string,
  canonicalAppUrl: string,
): URL | null {
  const currentUrl = new URL(requestUrl);
  const canonicalUrl = new URL(canonicalAppUrl);

  if (currentUrl.origin === canonicalUrl.origin) {
    return null;
  }

  currentUrl.protocol = canonicalUrl.protocol;
  currentUrl.host = canonicalUrl.host;
  currentUrl.searchParams.delete("_vercel_share");

  return currentUrl;
}
