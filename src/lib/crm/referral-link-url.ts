import { getAppBaseUrl } from "@/lib/app-url";

/** Public referral URL for a token slug (campaign/rep/facility). */
export function buildReferralTokenPublicPath(token: string): string {
  const t = token.trim();
  return `/refer/t/${encodeURIComponent(t)}`;
}

export function buildReferralTokenPublicUrl(token: string, origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : getAppBaseUrl())) || "";
  const path = buildReferralTokenPublicPath(token);
  if (!base) return path;
  return `${base.replace(/\/$/, "")}${path}`;
}

export function buildUniversalReferralPublicUrl(origin?: string): string {
  const base = (origin ?? (typeof window !== "undefined" ? window.location.origin : getAppBaseUrl())) || "";
  if (!base) return "/refer";
  return `${base.replace(/\/$/, "")}/refer`;
}

/** Token segment used in URLs — prefers short_slug when set. */
export function publicTokenSegment(link: { token: string | null; short_slug?: string | null }): string | null {
  const slug = (link.short_slug ?? "").trim();
  if (slug) return slug;
  const token = (link.token ?? "").trim();
  return token || null;
}
