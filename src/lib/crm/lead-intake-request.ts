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
  /** Physical therapy — preferred timing / urgency from Facebook Lead Ads. */
  pt_timing: string;
  /** Wound care — explicit wound type label when provided. */
  wound_type: string;
  /** Facebook wound-care form — insurance answer (e.g. Medicare). */
  insurance_answer: string;
};

const EMPTY: LeadIntakeRequestDetails = {
  zip_code: "",
  service_needed: "",
  care_for: "",
  start_time: "",
  situation: "",
  pt_timing: "",
  wound_type: "",
  insurance_answer: "",
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
  const woundType = fv(fieldMap, [
    "wound_type",
    "wound type",
    "wound_care_needed",
    "wound care needed",
    "what_type_of_help_is_needed",
    "what type of help is needed",
    "help_needed",
    "help needed",
  ]);
  const situation = fv(fieldMap, [
    "situation",
    "tell_us_whats_going_on",
    "tell us whats going on",
    "optional_tell_us_whats_going_on_and_what_kind_of_help_is_needed",
    "optional tell us whats going on and what kind of help is needed",
    "wound_type",
    "wound type",
    "wound_care_needed",
    "wound care needed",
  ]);
  return {
    zip_code: fv(fieldMap, ["zip_code", "zip", "zip code", "postal_code", "postal code"]),
    service_needed: fv(fieldMap, [
      "service_needed",
      "service needed",
      "service",
      "what_type_of_help_is_needed",
      "what type of help is needed",
      "help_needed",
      "help needed",
    ]),
    care_for: fv(fieldMap, ["care_for", "care for", "who_is_care_needed_for", "who is care needed for"]),
    start_time: fv(fieldMap, ["start_time", "start time"]),
    situation,
    pt_timing: fv(fieldMap, ["pt_timing", "pt timing"]),
    wound_type: woundType,
    insurance_answer: fv(fieldMap, [
      "insurance_answer",
      "insurance answer",
      "has_medicare",
      "has medicare",
      "medicare",
      "what_coverage_do_they_have",
      "what coverage do they have",
      "coverage",
      "insurance",
    ]),
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
      pt_timing: s("pt_timing"),
      wound_type: s("wound_type"),
      insurance_answer: s("insurance_answer"),
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
