import type { AdminCrmLeadListUrlFilters } from "@/lib/crm/admin-crm-leads-list-filters";

export const ADMIN_CRM_LEADS_LIST_PATH_PREFIX = "/admin/crm/leads";

/** Safe target for “Back to leads” from lead detail (open redirect hardening). */
export function safeAdminCrmLeadsListReturnUrl(
  raw: string | string[] | undefined | null
): string {
  const input = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] ?? "" : "";
  let s = input.trim();
  if (!s) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;

  try {
    s = decodeURIComponent(s);
  } catch {
    return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  }
  s = s.trim();
  if (!s.startsWith(ADMIN_CRM_LEADS_LIST_PATH_PREFIX)) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  if (s.startsWith("//")) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  if (s.includes("://")) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  if (s.includes("\\")) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  if (/[\u0000-\u001F\u007F]/.test(s)) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;

  return s;
}

/** Lead detail link with `returnTo` so Back / navigation can restore list filters. */
export function buildAdminCrmLeadDetailHref(leadId: string, listContextHref: string): string {
  const id = String(leadId ?? "").trim();
  if (!id) return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  const list = (listContextHref ?? "").trim() || ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
  return `${ADMIN_CRM_LEADS_LIST_PATH_PREFIX}/${encodeURIComponent(id)}?returnTo=${encodeURIComponent(list)}`;
}

/** Round-trip helpers for CRM leads list URLs (filters + paging + density). */
export type AdminCrmLeadListHrefState = AdminCrmLeadListUrlFilters & {
  /** Raw search query for contacts */
  q: string;
  /** `followUp` URL value: `"today"` or empty (legacy dashboard / bookmark). */
  followUp: string;
  page: number;
  /** Omit from URL when default compact */
  density: "compact" | "comfortable";
};

export function buildAdminCrmLeadsHref(state: Partial<AdminCrmLeadListHrefState>): string {
  const u = new URLSearchParams();

  const {
    contactStatus = "",
    leadPriority = "",
    owner = "",
    payer = "",
    followUp = "",
    q = "",
    includeDead = false,
    page = 1,
    density = "compact",
  } = state;

  if (contactStatus.trim()) u.set("contactStatus", contactStatus.trim());
  if (leadPriority.trim()) u.set("leadPriority", leadPriority.trim());
  if (owner.trim()) u.set("owner", owner.trim());
  if (payer.trim()) u.set("payer", payer.trim());
  if (followUp.trim()) u.set("followUp", followUp.trim());
  if (q.trim()) u.set("q", q.trim());
  if (includeDead) u.set("includeDead", "1");

  const p = Math.max(1, Math.floor(Number(page)) || 1);
  if (p > 1) u.set("page", String(p));

  if (density === "comfortable") u.set("density", "comfortable");

  const qs = u.toString();
  return qs ? `${ADMIN_CRM_LEADS_LIST_PATH_PREFIX}?${qs}` : ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
}

export function adminLeadsHrefClearAll(): string {
  return ADMIN_CRM_LEADS_LIST_PATH_PREFIX;
}
