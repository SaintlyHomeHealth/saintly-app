/**
 * Canonical CRM app origin for outbound links (SMS, email, Stripe redirects).
 * Production: https://appsaintlyhomehealth.com (no dot after "app").
 *
 * Set in Vercel:
 *   NEXT_PUBLIC_APP_URL=https://appsaintlyhomehealth.com
 *   APP_URL=https://appsaintlyhomehealth.com
 *
 * Do not use https://app.saintlyhomehealth.com — that host is auto-corrected for links
 * but should be fixed in env.
 */

export const CANONICAL_CRM_ORIGIN = "https://appsaintlyhomehealth.com";

const CORRECT_CRM_HOST = "appsaintlyhomehealth.com";
const WRONG_CRM_HOST = "app.saintlyhomehealth.com";

function hostnameOf(url: string): string | null {
  try {
    return new URL(url.startsWith("http") ? url : `https://${url}`).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** Raw value from env without host correction. */
export function readConfiguredAppUrlFromEnv(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.trim() || process.env.APP_URL?.trim() || "";
}

/**
 * Rewrites the mistaken dotted CRM host to the canonical origin so SMS/email/PDF
 * links work even when Vercel still has the old APP_URL value.
 */
export function normalizeCrmAppOrigin(url: string): string {
  const trimmed = (url ?? "").trim().replace(/\/$/, "");
  if (!trimmed) return "";
  if (hostnameOf(trimmed) === WRONG_CRM_HOST) {
    return CANONICAL_CRM_ORIGIN;
  }
  return trimmed;
}

export function getAppBaseUrl(fallbackOrigin?: string): string {
  const raw = readConfiguredAppUrlFromEnv();
  if (raw) return normalizeCrmAppOrigin(raw);
  const fb = (fallbackOrigin ?? "").trim();
  if (fb) return normalizeCrmAppOrigin(fb);
  return "";
}

/**
 * Non-blocking warning for admins when env is missing or still uses the wrong host.
 * Link generation uses {@link getAppBaseUrl} and is already corrected.
 */
export function getAppBaseUrlEnvWarning(): string | null {
  const raw = readConfiguredAppUrlFromEnv();
  if (!raw) {
    return "Set NEXT_PUBLIC_APP_URL and APP_URL to https://appsaintlyhomehealth.com in Vercel (then redeploy).";
  }
  const host = hostnameOf(raw);
  if (host === WRONG_CRM_HOST) {
    return "Vercel still has https://app.saintlyhomehealth.com — update both URL vars to https://appsaintlyhomehealth.com and redeploy. The invoice link below already uses the correct host.";
  }
  if (host && host !== CORRECT_CRM_HOST) {
    return `NEXT_PUBLIC_APP_URL should be ${CANONICAL_CRM_ORIGIN} (currently ${raw}).`;
  }
  return null;
}

/** Blocks only when no usable base URL can be built (missing or invalid). */
export function validateAppBaseUrl(baseUrl: string): string | null {
  const trimmed = (baseUrl ?? "").trim();
  if (!trimmed) {
    return "App URL is not configured. Set NEXT_PUBLIC_APP_URL and APP_URL to https://appsaintlyhomehealth.com.";
  }
  try {
    new URL(trimmed.startsWith("http") ? trimmed : `https://${trimmed}`);
  } catch {
    return "NEXT_PUBLIC_APP_URL / APP_URL is not a valid URL.";
  }
  return null;
}

export function hasConfiguredAppBaseUrl(): boolean {
  return Boolean(readConfiguredAppUrlFromEnv());
}
