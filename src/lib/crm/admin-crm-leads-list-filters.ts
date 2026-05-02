/**
 * Shared filter predicates for `/admin/crm/leads` list queries (data + counts).
 */

import { escapeForIlike } from "@/lib/crm/crm-leads-search";
import { isValidLeadPipelineStatus } from "@/lib/crm/lead-pipeline-status";
import { isValidLeadSource } from "@/lib/crm/lead-source-options";
import { PAYER_BROAD_CATEGORY_OPTIONS } from "@/lib/crm/payer-type-options";
import { SERVICE_DISCIPLINE_CODES } from "@/lib/crm/service-disciplines";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Contacts search returned no hits — impossible id constrains list/count to zero. */
export const EMPTY_CONTACT_SENTINEL = "00000000-0000-0000-0000-000000000000";

export const ADMIN_CRM_LEADS_PAGE_SIZE = 50;

/** URL `contactOutcome` — latest logged attempt (`leads.last_contact_at` / `last_outcome` / `last_contact_type`). */
export const ADMIN_CRM_LEAD_LIST_CONTACT_OUTCOME_URL_VALUES = [
  "left_voicemail",
  "spoke",
  "sent_text",
  "called",
  "none",
] as const;

export type AdminCrmLeadListContactOutcomeFilter =
  (typeof ADMIN_CRM_LEAD_LIST_CONTACT_OUTCOME_URL_VALUES)[number];

export function isValidAdminCrmLeadListContactOutcomeFilter(v: string): v is AdminCrmLeadListContactOutcomeFilter {
  return (ADMIN_CRM_LEAD_LIST_CONTACT_OUTCOME_URL_VALUES as readonly string[]).includes(v);
}

export function formatAdminCrmLeadListContactOutcomeFilterLabel(v: AdminCrmLeadListContactOutcomeFilter): string {
  switch (v) {
    case "left_voicemail":
      return "Left voicemail";
    case "spoke":
      return "Spoke";
    case "sent_text":
      return "Sent text";
    case "called":
      return "Called";
    case "none":
      return "No attempts logged";
  }
}

export type AdminCrmLeadListUrlFilters = {
  status: string;
  source: string;
  owner: string;
  followUpToday: boolean;
  payerType: string;
  discipline: string;
  leadType: string;
  showDead: boolean;
  /** Empty or a valid `ADMIN_CRM_LEAD_LIST_CONTACT_OUTCOME_URL_VALUES` slug (URL param `contactOutcome`). */
  contactOutcome: string;
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

  if (f.status && isValidLeadPipelineStatus(f.status)) q = q.eq("status", f.status);

  if (f.source && isValidLeadSource(f.source)) q = q.eq("source", f.source);

  if (UUID_RE.test(f.owner)) q = q.eq("owner_user_id", f.owner);

  if (f.followUpToday) q = q.eq("follow_up_date", deps.todayIso);

  if (f.leadType !== "employee") {
    if (
      f.payerType &&
      PAYER_BROAD_CATEGORY_OPTIONS.includes(f.payerType as (typeof PAYER_BROAD_CATEGORY_OPTIONS)[number])
    ) {
      q = q.eq("payer_type", f.payerType);
    }
    if (
      f.discipline &&
      SERVICE_DISCIPLINE_CODES.includes(f.discipline as (typeof SERVICE_DISCIPLINE_CODES)[number])
    ) {
      q = q.or(`service_disciplines.ov.{${f.discipline}},service_type.ilike.%${escapeForIlike(f.discipline)}%`);
    }
  }

  if (f.leadType === "employee") q = q.eq("lead_type", "employee");
  else if (f.leadType === "patient") q = q.is("lead_type", null);

  const co = (f.contactOutcome ?? "").trim();
  if (co && isValidAdminCrmLeadListContactOutcomeFilter(co)) {
    switch (co) {
      case "left_voicemail":
        q = q.eq("last_outcome", "left_voicemail");
        break;
      case "spoke":
        q = q.or(
          "last_outcome.in.(spoke,spoke_scheduled,contacted),and(last_outcome.is.null,status.eq.spoke),and(last_outcome.is.null,status.eq.contacted)"
        );
        break;
      case "sent_text":
        q = q.eq("last_outcome", "text_sent");
        break;
      case "called":
        q = q.eq("last_contact_type", "call");
        q = q.or("last_outcome.is.null,last_outcome.eq.no_answer,last_outcome.eq.wrong_number,last_outcome.eq.not_interested");
        break;
      case "none":
        q = q.is("last_contact_at", null);
        break;
      default:
        break;
    }
  }

  if (!f.showDead && !f.status) q = q.neq("status", "dead_lead");

  return q;
}
