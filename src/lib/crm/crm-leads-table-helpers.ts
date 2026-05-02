/** Shared types + pure helpers for the admin CRM leads table (server + client). */

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
  /** ISO instant; paired with `follow_up_date` for list display with time (Central). */
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
  contacts: CrmLeadsContactEmb | CrmLeadsContactEmb[] | null;
};

export function contactDisplayName(c: CrmLeadsContactEmb | null): string {
  if (!c) return "—";
  const fn = (c.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [c.first_name, c.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
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
  const parsed = new Date(`${d}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return d;
  return parsed.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

const CRM_LIST_FU_TZ = "America/Chicago";

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
