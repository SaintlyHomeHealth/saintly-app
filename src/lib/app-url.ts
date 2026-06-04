/**
 * Canonical app origin for outbound links (SMS, email, Stripe redirects).
 * Set in production:
 *   NEXT_PUBLIC_APP_URL=https://app.saintlyhomehealth.com
 *   APP_URL=https://app.saintlyhomehealth.com
 *
 * Do not use `NEXT_PUBLIC_SITE_URL` or the marketing host (appsaintlyhomehealth.com) here.
 */

export function getAppBaseUrl(fallbackOrigin?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fb = (fallbackOrigin ?? "").trim().replace(/\/$/, "");
  return fb;
}

/**
 * Returns an error message when the configured app URL uses the wrong host
 * (e.g. appsaintlyhomehealth.com without the "app." subdomain).
 */
export function validateAppBaseUrl(baseUrl: string): string | null {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) return "App URL is not configured. Set NEXT_PUBLIC_APP_URL and APP_URL.";
  try {
    const host = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname
      .toLowerCase();
    if (host === "appsaintlyhomehealth.com") {
      return "Use https://app.saintlyhomehealth.com (with a dot after app), not appsaintlyhomehealth.com.";
    }
  } catch {
    return "NEXT_PUBLIC_APP_URL / APP_URL is not a valid URL.";
  }
  return null;
}

/** True when a production app URL is configured (avoids preview/wrong hosts in comms). */
export function hasConfiguredAppBaseUrl(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim()
  );
}
