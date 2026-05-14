/**
 * Shared filter predicates for `/admin/crm/leads` list queries (data + counts).
 */

import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import { LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY } from "@/lib/crm/lead-holds";
import { isValidLeadTemperature } from "@/lib/crm/lead-temperature";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const ADMIN_CRM_LEADS_PAGE_SIZE = 50;

/** URL `contactStatus` — latest contact outcome / call type, plus boolean hold columns (patient leads only). */
export const ADMIN_CRM_LEADS_CONTACT_STATUS_URL_VALUES = [
  "spoke",
  "left_vm",
  "called",
  "no_answer",
  "no_response",
  /** Same key as `leads.waiting_on_doctors_orders` (non-employee rows that show the red badge). */
  "waiting_on_doctors_orders",
  /** Same key as `leads.waiting_on_insurance_verification` (non-employee rows — amber badge). */
  LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY,
] as const;

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
    case "no_response":
      return "No response";
    case "waiting_on_doctors_orders":
      return "Waiting on doctor's orders";
    case LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY:
      return "Waiting on Insurance Verification";
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

export type AdminCrmLeadListQueryDeps = {
  todayIso: string;
  /** From {@link resolveAdminCrmLeadsKeywordLeadSearchOr} — omit keyword constraint when null (empty `q`). */
  keywordLeadSearchOr: string | null;
};

/** Narrow chaining surface for Supabase lead queries without importing heavy generics (TS2589). */
type LeadListFilterQB = {
  eq(c: string, v: unknown): LeadListFilterQB;
  neq(c: string, v: unknown): LeadListFilterQB;
  in(c: string, vals: unknown[]): LeadListFilterQB;
  is(c: string, v: unknown): LeadListFilterQB;
  or(expr: string): LeadListFilterQB;
};

/**
 * Apply URL-driven filters shared by row `.select(...)` and `{ count: "exact", head: true }` chains.
 * Prefix with `leadRowsActiveOnly(...)`. Returned value is loosely typed so Supabase generics do not recurse (TS2589).
 */
export function attachAdminCrmLeadListPredicates(
  qb: unknown,
  f: AdminCrmLeadListUrlFilters,
  deps: AdminCrmLeadListQueryDeps
): unknown {
  let q = qb as LeadListFilterQB;

  if (deps.keywordLeadSearchOr) q = q.or(deps.keywordLeadSearchOr);

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
      case "no_response":
        q = q.eq("last_outcome", "no_response");
        break;
      case "called":
        q = q.eq("last_contact_type", "call");
        q = q.or("last_outcome.is.null,last_outcome.eq.wrong_number,last_outcome.eq.not_interested");
        break;
      case "waiting_on_doctors_orders":
        q = q.eq("waiting_on_doctors_orders", true);
        q = q.or("lead_type.is.null,lead_type.neq.employee");
        break;
      case LEAD_HOLD_WAITING_ON_INSURANCE_VERIFICATION_KEY:
        q = q.eq("waiting_on_insurance_verification", true);
        q = q.or("lead_type.is.null,lead_type.neq.employee");
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
    else if (legacyCo === "no_response") contactStatus = "no_response";
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
