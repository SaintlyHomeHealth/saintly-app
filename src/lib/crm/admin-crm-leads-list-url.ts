import type { AdminCrmLeadListUrlFilters } from "@/lib/crm/admin-crm-leads-list-filters";

/** Round-trip helpers for CRM leads list URLs (filters + paging + density). */
export type AdminCrmLeadListHrefState = Omit<AdminCrmLeadListUrlFilters, "followUpToday"> & {
  /** Raw search query for contacts */
  q: string;
  /** `followUp` URL value: `"today"` or empty */
  followUp: string;
  page: number;
  /** Omit from URL when default compact */
  density: "compact" | "comfortable";
};

export function buildAdminCrmLeadsHref(state: Partial<AdminCrmLeadListHrefState>): string {
  const u = new URLSearchParams();

  const {
    status = "",
    source = "",
    owner = "",
    followUp = "",
    payerType = "",
    discipline = "",
    leadType = "",
    contactOutcome = "",
    q = "",
    showDead = false,
    page = 1,
    density = "compact",
  } = state;

  if (status.trim()) u.set("status", status.trim());
  if (source.trim()) u.set("source", source.trim());
  if (owner.trim()) u.set("owner", owner.trim());
  if (followUp.trim()) u.set("followUp", followUp.trim());
  if (payerType.trim()) u.set("payerType", payerType.trim());
  if (discipline.trim()) u.set("discipline", discipline.trim());
  if (leadType.trim()) u.set("leadType", leadType.trim());
  if (contactOutcome.trim()) u.set("contactOutcome", contactOutcome.trim());
  if (q.trim()) u.set("q", q.trim());
  if (showDead) u.set("showDead", "1");

  const p = Math.max(1, Math.floor(Number(page)) || 1);
  if (p > 1) u.set("page", String(p));

  if (density === "comfortable") u.set("density", "comfortable");

  const qs = u.toString();
  return qs ? `/admin/crm/leads?${qs}` : "/admin/crm/leads";
}

export function adminLeadsHrefClearAll(): string {
  return "/admin/crm/leads";
}
