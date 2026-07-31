export const packagePrivateResponseHeaders = {
  "Cache-Control": "no-store, max-age=0",
  Pragma: "no-cache",
  "Referrer-Policy": "no-referrer",
  "X-Robots-Tag": "noindex, nofollow, noarchive",
} as const;

export function isSameOriginPackageRequest(input: Readonly<{
  requestUrl: string;
  origin: string | null;
  fetchSite: string | null;
}>): boolean {
  const expectedOrigin = new URL(input.requestUrl).origin;

  if (input.origin) {
    try {
      return new URL(input.origin).origin === expectedOrigin;
    } catch {
      return false;
    }
  }

  return input.fetchSite === "same-origin" || input.fetchSite === "none";
}
