import {
  CRM_CONTACT_TYPE_LABELS,
  type CrmContactTypeValue,
  labelForContactType,
  normalizeCrmContactType,
} from "@/lib/crm/contact-types";
import { normalizePhone } from "@/lib/phone/us-phone-format";

export type ContactDirectoryTypeFilter = "all" | CrmContactTypeValue;

/** URL `type` param: Patient / Lead match linked CRM rows or matching `contact_type`. */
export const CONTACT_DIRECTORY_TYPE_FILTERS: { value: ContactDirectoryTypeFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "patient", label: "Patient" },
  { value: "lead", label: "Lead" },
  { value: "referral", label: "Referral" },
  { value: "physician", label: "Physician" },
  { value: "facility", label: "Facility" },
  { value: "payer", label: "Payer" },
  { value: "other", label: "Other" },
];

export function isContactDirectoryTypeFilter(v: string): v is ContactDirectoryTypeFilter {
  return CONTACT_DIRECTORY_TYPE_FILTERS.some((x) => x.value === v);
}

/** CRM address columns live only on `public.contacts` (source of truth for mailing / service location on the person/org). */
export type ContactDirectoryDbRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  organization_name: string | null;
  primary_phone: string | null;
  secondary_phone: string | null;
  email: string | null;
  address_line_1?: string | null;
  address_line_2?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  contact_type: string | null;
  status: string | null;
  referral_source: string | null;
  owner_user_id: string | null;
  relationship_metadata: unknown;
  notes: string | null;
  archived_at?: string | null;
  created_at: string;
  updated_at: string;
};

/** Multi-line US-style block for display; returns null when all address parts are empty. */
export function formatContactAddressBlock(
  row: Pick<ContactDirectoryDbRow, "address_line_1" | "address_line_2" | "city" | "state" | "zip">
): string | null {
  const l1 = (row.address_line_1 ?? "").trim();
  const l2 = (row.address_line_2 ?? "").trim();
  const city = (row.city ?? "").trim();
  const state = (row.state ?? "").trim();
  const zip = (row.zip ?? "").trim();
  const cityLine = [city, [state, zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");
  const parts = [l1, l2, cityLine].filter(Boolean);
  return parts.length > 0 ? parts.join("\n") : null;
}

export function relationshipMetadataIsEmpty(meta: unknown): boolean {
  if (meta == null) return true;
  if (typeof meta !== "object") return false;
  return Object.keys(meta as object).length === 0;
}

export type PatientLinkBrief = { id: string; patient_status: string };
export type LeadLinkBrief = {
  id: string;
  source: string;
  status: string | null;
  owner_user_id: string | null;
};

export type LeadRowWithContact = LeadLinkBrief & { contact_id: string; created_at: string };

/** Newest lead first per contact. */
export function groupLeadsByContactId(rows: LeadRowWithContact[]): Map<string, LeadLinkBrief[]> {
  const m = new Map<string, LeadRowWithContact[]>();
  for (const r of rows) {
    const arr = m.get(r.contact_id) ?? [];
    arr.push(r);
    m.set(r.contact_id, arr);
  }
  const out = new Map<string, LeadLinkBrief[]>();
  for (const [k, arr] of m) {
    arr.sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
    out.set(
      k,
      arr.map(({ id, source, status, owner_user_id }) => ({ id, source, status, owner_user_id }))
    );
  }
  return out;
}

export function contactDirectoryDisplayName(row: Pick<ContactDirectoryDbRow, "organization_name" | "full_name" | "first_name" | "last_name">): string {
  const org = (row.organization_name ?? "").trim();
  if (org) return org;
  const fn = (row.full_name ?? "").trim();
  if (fn) return fn;
  const parts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return parts || "—";
}

function readMetaString(meta: unknown, key: string): string | null {
  if (!meta || typeof meta !== "object") return null;
  const v = (meta as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/** One-line summary for directory table; full onboarding belongs in credentialing workflows. */
export function credentialingSummaryFromMetadata(meta: unknown): string {
  const stage = readMetaString(meta, "credentialing_stage");
  const plan = readMetaString(meta, "payer_plan_id");
  const npi = readMetaString(meta, "payer_npi");
  const contract = readMetaString(meta, "contract_status");
  const parts: string[] = [];
  if (stage) parts.push(stage);
  if (contract) parts.push(contract);
  if (plan) parts.push(`Plan ${plan}`);
  if (npi) parts.push(`NPI ${npi}`);
  return parts.length > 0 ? parts.join(" · ") : "—";
}

export function buildRelationshipTypeBadges(
  row: Pick<ContactDirectoryDbRow, "contact_type">,
  patient: PatientLinkBrief | null,
  leads: LeadLinkBrief[]
): string[] {
  const badges: string[] = [];
  const canonical = normalizeCrmContactType(row.contact_type);
  if (patient) badges.push("Patient");
  if (leads.length > 0) badges.push("Lead");
  if (canonical === "patient" && !patient) badges.push(CRM_CONTACT_TYPE_LABELS.patient);
  if (canonical === "lead" && leads.length === 0) badges.push(CRM_CONTACT_TYPE_LABELS.lead);
  if (canonical && canonical !== "patient" && canonical !== "lead") {
    badges.push(CRM_CONTACT_TYPE_LABELS[canonical]);
  }
  if (!canonical && (row.contact_type ?? "").trim()) {
    badges.push(labelForContactType(row.contact_type));
  }
  if (badges.length === 0) badges.push("Other");
  return [...new Set(badges)];
}

export function resolveDirectoryOwnerUserId(
  row: Pick<ContactDirectoryDbRow, "owner_user_id">,
  leads: LeadLinkBrief[]
): string | null {
  if (row.owner_user_id) return row.owner_user_id;
  for (const l of leads) {
    if (l.owner_user_id) return l.owner_user_id;
  }
  return null;
}

export function resolveDirectorySourceLabel(
  row: Pick<ContactDirectoryDbRow, "referral_source">,
  leads: LeadLinkBrief[]
): string {
  const rs = (row.referral_source ?? "").trim();
  if (rs) return rs;
  const leadSrc = leads[0]?.source;
  if (leadSrc) return leadSrc;
  return "—";
}

export function resolveDirectoryStatusLabel(
  row: Pick<ContactDirectoryDbRow, "status">,
  patient: PatientLinkBrief | null,
  leads: LeadLinkBrief[]
): string {
  const st = (row.status ?? "").trim();
  if (st) return st;
  if (patient) return `Patient: ${patient.patient_status}`;
  const leadSt = leads[0]?.status;
  if (leadSt?.trim()) return `Lead: ${leadSt.trim()}`;
  return "—";
}

export function matchesContactDirectorySearch(
  row: ContactDirectoryDbRow,
  q: string,
  patient: PatientLinkBrief | null,
  leads: LeadLinkBrief[]
): boolean {
  const needle = q.trim().toLowerCase();
  if (!needle) return true;
  const name = contactDirectoryDisplayName(row).toLowerCase();
  const email = (row.email ?? "").toLowerCase();
  const phone = (row.primary_phone ?? "").toLowerCase();
  const sec = (row.secondary_phone ?? "").toLowerCase();
  const needleDigits = normalizePhone(q);
  const p1 = normalizePhone(row.primary_phone ?? "");
  const p2 = normalizePhone(row.secondary_phone ?? "");
  if (needleDigits && (p1.includes(needleDigits) || p2.includes(needleDigits))) return true;
  if (name.includes(needle) || email.includes(needle) || phone.includes(needle) || sec.includes(needle)) return true;
  const metaPlan = readMetaString(row.relationship_metadata, "payer_plan_id");
  if (metaPlan?.toLowerCase().includes(needle)) return true;
  if (patient?.patient_status.toLowerCase().includes(needle)) return true;
  for (const l of leads) {
    if (l.source.toLowerCase().includes(needle)) return true;
    if ((l.status ?? "").toLowerCase().includes(needle)) return true;
  }
  const addr = [row.address_line_1, row.address_line_2, row.city, row.state, row.zip]
    .map((x) => (typeof x === "string" ? x : "").trim().toLowerCase())
    .filter(Boolean)
    .join(" ");
  if (addr && addr.includes(needle)) return true;
  return false;
}

export function matchesContactDirectoryTypeFilter(
  filter: ContactDirectoryTypeFilter,
  row: Pick<ContactDirectoryDbRow, "contact_type" | "id">,
  patientByContactId: Map<string, PatientLinkBrief>,
  leadIdsByContactId: Map<string, LeadLinkBrief[]>
): boolean {
  if (filter === "all") return true;
  const patient = patientByContactId.get(row.id) ?? null;
  const leads = leadIdsByContactId.get(row.id) ?? [];
  const canonical = normalizeCrmContactType(row.contact_type);
  if (filter === "patient") return patient !== null || canonical === "patient";
  if (filter === "lead") return leads.length > 0 || canonical === "lead";
  return canonical === filter;
}
