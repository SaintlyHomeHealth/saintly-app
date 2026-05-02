/**
 * Structured intake fields aligned with Facebook Lead Ads / Zapier (`fields.*`) and manual CRM entry.
 * Stored at `leads.external_source_metadata.intake_request` (jsonb).
 */

export type LeadIntakeRequestDetails = {
  zip_code: string;
  service_needed: string;
  care_for: string;
  start_time: string;
  situation: string;
};

const EMPTY: LeadIntakeRequestDetails = {
  zip_code: "",
  service_needed: "",
  care_for: "",
  start_time: "",
  situation: "",
};

function fv(map: Map<string, string>, keys: string[]): string {
  for (const k of keys) {
    const v = map.get(k);
    if (v && v.trim()) return v.trim();
  }
  return "";
}

type GraphFieldDatum = { name?: string; values?: string[] };

function buildFieldMapFromGraphFieldData(fieldData: unknown): Map<string, string> {
  const m = new Map<string, string>();
  if (!Array.isArray(fieldData)) return m;
  for (const row of fieldData) {
    const r = row as GraphFieldDatum;
    const key = typeof r?.name === "string" ? r.name.trim().toLowerCase() : "";
    const vals = Array.isArray(r?.values) ? r.values : [];
    const val = vals
      .map((x) => (typeof x === "string" ? x.trim() : String(x ?? "")))
      .filter(Boolean)
      .join(", ");
    if (key && val) m.set(key, val);
  }
  return m;
}

/** Build from normalized lowercased field map keys (Facebook / Zapier `fields` after normalization). */
export function buildLeadIntakeRequestFromFieldMap(fieldMap: Map<string, string>): LeadIntakeRequestDetails {
  return {
    zip_code: fv(fieldMap, ["zip_code", "zip", "zip code", "postal_code", "postal code"]),
    service_needed: fv(fieldMap, ["service_needed", "service needed"]),
    care_for: fv(fieldMap, ["care_for", "care for"]),
    start_time: fv(fieldMap, ["start_time", "start time"]),
    situation: fv(fieldMap, ["situation", "wound_type", "wound type"]),
  };
}

export function hasAnyIntakeRequestDetail(d: LeadIntakeRequestDetails): boolean {
  return Object.values(d).some((v) => (v ?? "").trim() !== "");
}

/**
 * Prefer `external_source_metadata.intake_request`; else derive from `graph_field_data` when present.
 */
export function parseLeadIntakeRequestFromMetadata(meta: unknown): LeadIntakeRequestDetails {
  if (!meta || typeof meta !== "object" || Array.isArray(meta)) {
    return { ...EMPTY };
  }
  const m = meta as Record<string, unknown>;
  const ir = m.intake_request;
  if (ir && typeof ir === "object" && !Array.isArray(ir)) {
    const o = ir as Record<string, unknown>;
    const s = (k: keyof LeadIntakeRequestDetails) =>
      typeof o[k] === "string" ? (o[k] as string).trim() : "";
    const out: LeadIntakeRequestDetails = {
      zip_code: s("zip_code"),
      service_needed: s("service_needed"),
      care_for: s("care_for"),
      start_time: s("start_time"),
      situation: s("situation"),
    };
    if (hasAnyIntakeRequestDetail(out)) return out;
  }
  const gd = m.graph_field_data;
  if (gd) {
    const map = buildFieldMapFromGraphFieldData(gd);
    const out = buildLeadIntakeRequestFromFieldMap(map);
    if (hasAnyIntakeRequestDetail(out)) return out;
  }
  return { ...EMPTY };
}
