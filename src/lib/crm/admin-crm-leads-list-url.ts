import type { AdminCrmLeadListUrlFilters } from "@/lib/crm/admin-crm-leads-list-filters";

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
  return qs ? `/admin/crm/leads?${qs}` : "/admin/crm/leads";
}

export function adminLeadsHrefClearAll(): string {
  return "/admin/crm/leads";
}
