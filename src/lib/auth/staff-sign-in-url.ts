import "server-only";

import {
  canonicalAppOriginForStaffCommsFromEnv,
  STAFF_SIGN_IN_PATH,
  staffSignInPageUrlFromEnv,
} from "./staff-sign-in-url-build";

/**
 * Ops: set `NEXT_PUBLIC_APP_URL` to your **production** app origin (e.g. `https://app.saintlyhomehealth.com`)
 * in every Vercel/production environment that sends real staff SMS/email. Otherwise the origin can fall back
 * to `VERCEL_PROJECT_PRODUCTION_URL` or `VERCEL_URL` (preview deployments may leak preview hostnames).
 *
 * Supabase staff invite `redirectTo` uses {@link getCanonicalAppOriginForStaffComms} + `/auth/callback`.
 */

export { STAFF_SIGN_IN_PATH };

export function getCanonicalAppOriginForStaffComms(): string {
  return canonicalAppOriginForStaffCommsFromEnv(process.env, process.env.NODE_ENV);
}

export function getStaffSignInPageUrl(): string {
  return staffSignInPageUrlFromEnv(process.env, process.env.NODE_ENV);
}

export function getStaffLoginUrl(): string {
  return getStaffSignInPageUrl();
}
