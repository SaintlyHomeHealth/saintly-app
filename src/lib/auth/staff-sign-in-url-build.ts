/**
 * Pure URL construction for staff-facing sign-in links (SMS, email, clipboard).
 * Used by {@link ./staff-sign-in-url} and by `scripts/verify-staff-sign-in-url.mts`.
 */

export type StaffCommsEnv = {
  NEXT_PUBLIC_APP_URL?: string;
  VERCEL_PROJECT_PRODUCTION_URL?: string;
  VERCEL_URL?: string;
};

/** Public path used in all staff comms (redirects to `/login` in-app). */
export const STAFF_SIGN_IN_PATH = "/admin/login" as const;

/**
 * Resolve app origin for outbound staff messages.
 * Prefer `NEXT_PUBLIC_APP_URL` in every deployed environment so preview hostnames are not sent to users.
 */
export function canonicalAppOriginForStaffCommsFromEnv(
  env: StaffCommsEnv,
  nodeEnv: string | undefined
): string {
  const fromEnv = env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;
  if (nodeEnv === "development") {
    return "http://localhost:3000";
  }
  const production = env.VERCEL_PROJECT_PRODUCTION_URL?.trim();
  if (production) {
    if (production.startsWith("http://") || production.startsWith("https://")) {
      return production.replace(/\/$/, "");
    }
    return `https://${production}`.replace(/\/$/, "");
  }
  const vercel = env.VERCEL_URL?.trim();
  if (vercel) {
    return `https://${vercel}`.replace(/\/$/, "");
  }
  return "http://localhost:3000";
}

export function staffSignInPageUrlFromEnv(env: StaffCommsEnv, nodeEnv: string | undefined): string {
  return `${canonicalAppOriginForStaffCommsFromEnv(env, nodeEnv)}${STAFF_SIGN_IN_PATH}`;
}

/** When set, staff SMS/email must never use `VERCEL_URL` as the hostname. */
export function staffCommsUsesExplicitAppUrl(env: StaffCommsEnv): boolean {
  return Boolean(env.NEXT_PUBLIC_APP_URL?.trim());
}
