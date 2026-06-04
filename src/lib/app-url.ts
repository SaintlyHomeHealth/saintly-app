/**
 * Canonical app origin for outbound links (SMS, email, Stripe redirects).
 * Always prefer `NEXT_PUBLIC_APP_URL` in production (e.g. https://appsaintlyhomehealth.com).
 *
 * Do not use `NEXT_PUBLIC_SITE_URL` here — it may point at a marketing or legacy host.
 */

export function getAppBaseUrl(fallbackOrigin?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fb = (fallbackOrigin ?? "").trim().replace(/\/$/, "");
  return fb;
}

/** True when a production app URL is configured (avoids preview/wrong hosts in comms). */
export function hasConfiguredAppBaseUrl(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  );
}
