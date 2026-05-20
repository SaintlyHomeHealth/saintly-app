/** Shared types + pure helpers for the admin CRM leads table (server + client). */

import { formatAppDate } from "@/lib/datetime/app-timezone";
import { isValidCrmLeadId, logCrmLeadIdDebug, parseCrmLeadIdFromRow } from "@/lib/crm/crm-lead-id";

export type CrmLeadsContactEmb = {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  primary_phone?: string | null;
  secondary_phone?: string | null;
  email?: string | null;
};

export type CrmLeadRow = {
  id: string;
  contact_id: string;
  source: string;
  status: string | null;
  lead_type: string | null;
  owner_user_id: string | null;
  created_at: string;
  intake_status: string | null;
  referral_source: string | null;
  payer_name: string | null;
  payer_type: string | null;
  primary_payer_type?: string | null;
  primary_payer_name?: string | null;
  secondary_payer_type?: string | null;
  secondary_payer_name?: string | null;
  referring_provider_name: string | null;
  next_action: string | null;
  follow_up_date: string | null;
  /** ISO instant; paired with `follow_up_date` for list display with time (Phoenix). */
  follow_up_at?: string | null;
  last_contact_at: string | null;
  last_outcome: string | null;
  service_disciplines: string[] | null;
  service_type: string | null;
  notes?: string | null;
  external_source_metadata: unknown | null;
  /** Visual triage: hot | warm | cool | dead — `null` = unset. */
  lead_temperature?: string | null;
  /** Blocks scheduling until signed physician orders are received. */
  waiting_on_doctors_orders?: boolean | null;
  /** Insurance eligibility / benefits verification still pending. */
  waiting_on_insurance_verification?: boolean | null;
  /** Outbound call attempts tallied from CRM leads list (`+ Attempt`). */
  call_attempt_count?: number | null;
  contacts: CrmLeadsContactEmb | CrmLeadsContactEmb[] | null;
};

/** Admin CRM list/detail display name with safe fallback when contact is missing. */
export function contactDisplayName(c: CrmLeadsContactEmb | null, opts?: { unknownLabel?: string }): string {
  const unknown = opts?.unknownLabel ?? "Unknown patient";
  if (!c) return unknown;
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || unknown;
}

export function normalizeContact(
  raw: CrmLeadsContactEmb | CrmLeadsContactEmb[] | null | undefined
): CrmLeadsContactEmb | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw[0] ?? null;
  return raw;
}

export function trunc(s: string | null | undefined, n: number): string {
  const t = (s ?? "").trim();
  if (!t) return "—";
  return t.length > n ? t.slice(0, n) + "…" : t;
}

export function formatFollowUpDate(iso: string | null | undefined): string {
  if (!iso || typeof iso !== "string") return "—";
  const d = iso.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return "—";
  const parsed = Date.parse(`${d}T12:00:00-07:00`);
  if (!Number.isFinite(parsed)) return d;
  return formatAppDate(parsed, "—", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

const CRM_LIST_FU_TZ = "America/Phoenix";

/** Compact follow-up for leads list: date + time when `follow_up_at` is present. */
export function formatFollowUpListLabel(followUpDate: string | null | undefined, followUpAt: string | null | undefined): string {
  const dateStr = formatFollowUpDate(followUpDate);
  if (dateStr === "—") return "—";
  const at = typeof followUpAt === "string" ? followUpAt.trim() : "";
  if (!at) return dateStr;
  const inst = new Date(at);
  if (Number.isNaN(inst.getTime())) return dateStr;
  const timePart = new Intl.DateTimeFormat("en-US", {
    timeZone: CRM_LIST_FU_TZ,
    hour: "numeric",
    minute: "2-digit",
  }).format(inst);
  return `${dateStr} ${timePart}`;
}

export function staffPrimaryLabel(s: {
  user_id: string;
  email: string | null;
  full_name: string | null;
}): string {
  const name = (s.full_name ?? "").trim();
  if (name) return name;
  const em = (s.email ?? "").trim();
  if (em) {
    const local = em.split("@")[0]?.trim();
    if (local) {
      const words = local.replace(/[._+-]+/g, " ").split(/\s+/).filter(Boolean);
      if (words.length > 0) {
        return words.map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(" ");
      }
    }
  }
  return `${s.user_id.slice(0, 8)}…`;
}

export function contactEmail(c: CrmLeadsContactEmb | null): string {
  return typeof c?.email === "string" ? c.email.trim() : "";
}

function asStringArray(v: unknown): string[] | null {
  if (v == null) return null;
  if (!Array.isArray(v)) return null;
  return v.filter((x): x is string => typeof x === "string" && x.trim() !== "");
}

/** Normalize a leads list row from Supabase before passing to client components. */
export function normalizeCrmLeadRowForClient(raw: Record<string, unknown>): CrmLeadRow {
  const contacts = raw.contacts as CrmLeadsContactEmb | CrmLeadsContactEmb[] | null | undefined;
  const { id: leadId, valid: leadIdValid } = parseCrmLeadIdFromRow(raw.id);
  if (!leadIdValid && leadId) {
    logCrmLeadIdDebug("admin_crm_leads.normalize_row", {
      rawFromDb: raw.id,
      normalized: leadId,
    });
  }
  return {
    id: leadId,
    contact_id: typeof raw.contact_id === "string" ? raw.contact_id : String(raw.contact_id ?? ""),
    source: typeof raw.source === "string" ? raw.source : "",
    status: typeof raw.status === "string" ? raw.status : raw.status == null ? null : String(raw.status),
    lead_type: typeof raw.lead_type === "string" ? raw.lead_type : raw.lead_type == null ? null : String(raw.lead_type),
    owner_user_id:
      typeof raw.owner_user_id === "string" ? raw.owner_user_id : raw.owner_user_id == null ? null : String(raw.owner_user_id),
    created_at: typeof raw.created_at === "string" ? raw.created_at : "",
    intake_status: typeof raw.intake_status === "string" ? raw.intake_status : null,
    referral_source: typeof raw.referral_source === "string" ? raw.referral_source : null,
    payer_name: typeof raw.payer_name === "string" ? raw.payer_name : null,
    payer_type: typeof raw.payer_type === "string" ? raw.payer_type : null,
    primary_payer_type: typeof raw.primary_payer_type === "string" ? raw.primary_payer_type : null,
    primary_payer_name: typeof raw.primary_payer_name === "string" ? raw.primary_payer_name : null,
    secondary_payer_type: typeof raw.secondary_payer_type === "string" ? raw.secondary_payer_type : null,
    secondary_payer_name: typeof raw.secondary_payer_name === "string" ? raw.secondary_payer_name : null,
    referring_provider_name: typeof raw.referring_provider_name === "string" ? raw.referring_provider_name : null,
    next_action: typeof raw.next_action === "string" ? raw.next_action : null,
    follow_up_date: typeof raw.follow_up_date === "string" ? raw.follow_up_date : null,
    follow_up_at: typeof raw.follow_up_at === "string" ? raw.follow_up_at : null,
    last_contact_at: typeof raw.last_contact_at === "string" ? raw.last_contact_at : null,
    last_outcome: typeof raw.last_outcome === "string" ? raw.last_outcome : null,
    service_disciplines: asStringArray(raw.service_disciplines),
    service_type: typeof raw.service_type === "string" ? raw.service_type : null,
    notes: typeof raw.notes === "string" ? raw.notes : null,
    external_source_metadata: raw.external_source_metadata ?? null,
    lead_temperature: typeof raw.lead_temperature === "string" ? raw.lead_temperature : null,
    waiting_on_doctors_orders: raw.waiting_on_doctors_orders === true,
    waiting_on_insurance_verification: raw.waiting_on_insurance_verification === true,
    call_attempt_count:
      typeof raw.call_attempt_count === "number" && Number.isFinite(raw.call_attempt_count)
        ? raw.call_attempt_count
        : null,
    contacts: contacts ?? null,
  };
}
