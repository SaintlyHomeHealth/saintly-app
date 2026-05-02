/**
 * Shared filter predicates for `/admin/crm/leads` list queries (data + counts).
 */

import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import { isValidLeadTemperature } from "@/lib/crm/lead-temperature";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Contacts search returned no hits — impossible id constrains list/count to zero. */
export const EMPTY_CONTACT_SENTINEL = "00000000-0000-0000-0000-000000000000";

export const ADMIN_CRM_LEADS_PAGE_SIZE = 50;

/** URL `contactStatus` — latest contact attempt outcome (`leads.last_outcome` / `last_contact_type` / pipeline infer). */
export const ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES = ["spoke", "left_vm", "called", "no_answer"] as const;

export type AdminCrmLeadsContactStatusFilter = (typeof ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES)[number];

export function isValidAdminCrmLeadsContactStatusFilter(v: string): v is AdminCrmLeadsContactStatusFilter {
  return (ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES as readonly string[]).includes(v);
}

export function formatAdminCrmLeadsContactStatusLabel(v: AdminCrmLeadsContactStatusFilter): string {
  switch (v) {
    case "spoke":
      return "Spoke";
    case "left_vm":
      return "Left VM";
    case "called":
      return "Called";
    case "no_answer":
      return "No answer";
  }
}

export type AdminCrmLeadListUrlFilters = {
  contactStatus: string;
  leadPriority: string;
  owner: string;
  payer: string;
  /** Legacy/admin dashboard: `followUp=today` preserved in URL when active. */
  followUpToday: boolean;
  includeDead: boolean;
};

/**
 * Apply URL-driven filters shared by row `.select(...)` and `{ count: "exact", head: true }` chains.
 * Prefix with `leadRowsActiveOnly(...)`. Returned value is loosely typed so Supabase generics do not recurse (TS2589).
 */
export function attachAdminCrmLeadListPredicates(
  qb: unknown,
  f: AdminCrmLeadListUrlFilters,
  deps: { contactIdFilter: string[] | null; todayIso: string }
): unknown {
  let q = qb as {
    eq(c: string, v: unknown): unknown;
    neq(c: string, v: unknown): unknown;
    in(c: string, vals: unknown[]): unknown;
    is(c: string, v: unknown): unknown;
    or(expr: string): unknown;
  };

  if (deps.contactIdFilter) q = q.in("contact_id", deps.contactIdFilter);

  if (UUID_RE.test(f.owner)) q = q.eq("owner_user_id", f.owner);

  if (f.followUpToday) q = q.eq("follow_up_date", deps.todayIso);

  const pr = (f.leadPriority ?? "").trim();
  if (pr && isValidLeadTemperature(pr)) q = q.eq("lead_temperature", pr);

  const payerKw = (f.payer ?? "").trim();
  if (payerKw) {
    const e = escapeForIlike(payerKw);
    q = q.or(
      `payer_name.ilike.%${e}%,primary_payer_name.ilike.%${e}%,secondary_payer_name.ilike.%${e}%,payer_type.ilike.%${e}%,primary_payer_type.ilike.%${e}%,secondary_payer_type.ilike.%${e}%,referring_provider_name.ilike.%${e}%`
    );
  }

  const cs = (f.contactStatus ?? "").trim();
  if (cs && isValidAdminCrmLeadsContactStatusFilter(cs)) {
    switch (cs) {
      case "left_vm":
        q = q.eq("last_outcome", "left_voicemail");
        break;
      case "spoke":
        q = q.or(
          "last_outcome.in.(spoke,spoke_scheduled,contacted),and(last_outcome.is.null,status.eq.spoke),and(last_outcome.is.null,status.eq.contacted)"
        );
        break;
      case "no_answer":
        q = q.eq("last_outcome", "no_answer");
        break;
      case "called":
        q = q.eq("last_contact_type", "call");
        q = q.or("last_outcome.is.null,last_outcome.eq.wrong_number,last_outcome.eq.not_interested");
        break;
      default:
        break;
    }
  }

  if (!f.includeDead) q = q.neq("status", "dead_lead");

  return q;
}

/**
 * Parse new + legacy URL params into filter fields (safe mappings only).
 */
export function parseAdminCrmLeadsListSearchParams(raw: Record<string, string | string[] | undefined>): {
  contactStatus: string;
  leadPriority: string;
  owner: string;
  payer: string;
  followUp: string;
  q: string;
  includeDead: boolean;
} {
  const one = (k: string) => {
    const v = raw[k];
    return typeof v === "string" ? v : Array.isArray(v) ? v[0] ?? "" : "";
  };

  let contactStatus = one("contactStatus").trim();
  if (!contactStatus) {
    const legacyCo = one("contactOutcome").trim();
    if (legacyCo === "left_voicemail") contactStatus = "left_vm";
    else if (legacyCo === "spoke") contactStatus = "spoke";
    else if (legacyCo === "called") contactStatus = "called";
    else if (legacyCo === "no_answer") contactStatus = "no_answer";
  }

  let payer = one("payer").trim();
  if (!payer) payer = one("payerType").trim();

  const includeDead = one("includeDead").trim() === "1" || one("showDead").trim() === "1";

  return {
    contactStatus,
    leadPriority: one("leadPriority").trim(),
    owner: one("owner").trim(),
    payer,
    followUp: one("followUp").trim(),
    q: one("q").trim(),
    includeDead,
  };
}
