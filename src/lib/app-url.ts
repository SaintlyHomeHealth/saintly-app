/**
 * Canonical app origin for outbound links (SMS, email, Stripe redirects).
 * Set in production:
 *   NEXT_PUBLIC_APP_URL=https://appsaintlyhomehealth.com
 *   APP_URL=https://appsaintlyhomehealth.com
 *
 * Do not use `NEXT_PUBLIC_SITE_URL` or `https://app.saintlyhomehealth.com` (wrong host).
 */

export function getAppBaseUrl(fallbackOrigin?: string): string {
  const fromEnv =
    process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "";
  if (fromEnv) return fromEnv.replace(/\/$/, "");
  const fb = (fallbackOrigin ?? "").trim().replace(/\/$/, "");
  return fb;
}

/**
 * Returns an error when the app URL is missing, invalid, or uses the wrong CRM host
 * (`app.saintlyhomehealth.com` with a dot — production uses `appsaintlyhomehealth.com`).
 */
export function validateAppBaseUrl(baseUrl: string): string | null {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) return "App URL is not configured. Set NEXT_PUBLIC_APP_URL and APP_URL.";
  try {
    const host = new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`).hostname
      .toLowerCase();
    if (host === "app.saintlyhomehealth.com") {
      return "Use https://appsaintlyhomehealth.com for CRM links, not https://app.saintlyhomehealth.com.";
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
