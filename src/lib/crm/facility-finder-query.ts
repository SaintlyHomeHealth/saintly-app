/**
 * Quick specialty filters for the field-sales facility finder.
 * Maps user-friendly chip labels to facility type values and search keywords.
 */

export type FacilityFieldFilterId =
  | "podiatry"
  | "primary_care"
  | "wound_care"
  | "pain_management"
  | "hospice"
  | "assisted_living"
  | "snf_rehab"
  | "hospital"
  | "pediatrics"
  | "other";

export type FacilityFieldFilter = {
  id: FacilityFieldFilterId;
  label: string;
  /** Exact `facilities.type` values to match */
  types: string[];
  /** Extra keywords matched against name, type, notes */
  keywords: string[];
};

export const FACILITY_FIELD_FILTERS: FacilityFieldFilter[] = [
  {
    id: "podiatry",
    label: "Podiatry",
    types: ["Podiatry Office"],
    keywords: ["podiatry", "foot", "ankle"],
  },
  {
    id: "primary_care",
    label: "Primary Care",
    types: ["Primary Care Office", "Internal Medicine", "Geriatrics"],
    keywords: ["primary care", "family medicine", "internal medicine"],
  },
  {
    id: "wound_care",
    label: "Wound Care",
    types: ["Wound Clinic"],
    keywords: ["wound", "wound care"],
  },
  {
    id: "pain_management",
    label: "Pain Management",
    types: ["Pain Management"],
    keywords: ["pain management", "pain clinic"],
  },
  {
    id: "hospice",
    label: "Hospice",
    types: ["Hospice"],
    keywords: ["hospice"],
  },
  {
    id: "assisted_living",
    label: "Assisted Living",
    types: ["Assisted Living", "Independent Living"],
    keywords: ["assisted living", "senior living"],
  },
  {
    id: "snf_rehab",
    label: "SNF/Rehab",
    types: ["Skilled Nursing Facility", "Rehab Hospital", "LTACH"],
    keywords: ["snf", "skilled nursing", "rehab", "ltach"],
  },
  {
    id: "hospital",
    label: "Hospital",
    types: ["Hospital"],
    keywords: ["hospital", "medical center"],
  },
  {
    id: "pediatrics",
    label: "Pediatrics",
    types: [],
    keywords: ["pediatric", "pediatrics", "children"],
  },
  {
    id: "other",
    label: "Other",
    types: ["Other"],
    keywords: ["other"],
  },
];

export function getFieldFilterById(id: string): FacilityFieldFilter | null {
  return FACILITY_FIELD_FILTERS.find((f) => f.id === id) ?? null;
}

export type ParsedFacilityFinderQuery = {
  /** Remaining free-text after extracting city/specialty/near-me hints */
  text: string;
  city: string | null;
  nearMe: boolean;
  fieldFilterId: FacilityFieldFilterId | null;
  /** Digits-only when query looks like phone/fax */
  phoneDigits: string | null;
  isFaxSearch: boolean;
};

const NEAR_ME_RE = /\bnear\s+me\b/i;
const FAX_RE = /\bfax\b/i;

const CITY_HINTS = [
  "phoenix",
  "gilbert",
  "mesa",
  "chandler",
  "tempe",
  "scottsdale",
  "glendale",
  "peoria",
  "surprise",
  "avondale",
  "goodyear",
  "buckeye",
  "queen creek",
  "san tan valley",
  "apache junction",
  "douglas",
  "tucson",
  "flagstaff",
  "prescott",
  "yuma",
];

function detectFieldFilter(text: string): FacilityFieldFilter | null {
  const lower = text.toLowerCase();
  for (const filter of FACILITY_FIELD_FILTERS) {
    if (filter.keywords.some((kw) => lower.includes(kw))) return filter;
    if (filter.types.some((t) => lower.includes(t.toLowerCase()))) return filter;
  }
  return null;
}

function extractCity(text: string): { city: string | null; remainder: string } {
  let remainder = text;
  let city: string | null = null;
  for (const hint of CITY_HINTS) {
    const re = new RegExp(`\\b${hint.replace(/\s+/g, "\\s+")}\\b`, "i");
    if (re.test(remainder)) {
      city = hint
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");
      remainder = remainder.replace(re, " ").replace(/\s+/g, " ").trim();
      break;
    }
  }
  return { city, remainder };
}

function extractPhoneDigits(text: string): string | null {
  const digits = text.replace(/\D/g, "");
  if (digits.length >= 7) return digits;
  return null;
}

/**
 * Parse natural-language finder queries like "podiatry near me" or "wound care Phoenix".
 */
export function parseFacilityFinderQuery(raw: string): ParsedFacilityFinderQuery {
  let q = raw.trim();
  const nearMe = NEAR_ME_RE.test(q);
  q = q.replace(NEAR_ME_RE, " ").replace(/\s+/g, " ").trim();

  const isFaxSearch = FAX_RE.test(q);
  q = q.replace(FAX_RE, " ").replace(/\s+/g, " ").trim();

  const fieldFilter = detectFieldFilter(q);
  if (fieldFilter) {
    for (const kw of [...fieldFilter.keywords, ...fieldFilter.types.map((t) => t.toLowerCase())]) {
      q = q.replace(new RegExp(`\\b${kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "i"), " ");
    }
    q = q.replace(/\s+/g, " ").trim();
  }

  const { city, remainder } = extractCity(q);
  q = remainder;

  const phoneDigits = extractPhoneDigits(q);
  if (phoneDigits && phoneDigits.length >= 7) {
    q = q.replace(/\D/g, "").length === q.replace(/\s/g, "").length ? "" : q;
  }

  return {
    text: q.trim(),
    city,
    nearMe,
    fieldFilterId: fieldFilter?.id ?? null,
    phoneDigits: phoneDigits && phoneDigits.length >= 7 ? phoneDigits : null,
    isFaxSearch,
  };
}

export type FacilitySearchRow = {
  id: string;
  name: string;
  type: string | null;
  status: string;
  priority: string;
  city: string | null;
  state: string | null;
  main_phone: string | null;
  fax: string | null;
  email: string | null;
  website: string | null;
  address_line_1: string | null;
  address_line_2: string | null;
  zip: string | null;
  assigned_rep_user_id: string | null;
  last_visit_at: string | null;
  next_follow_up_at: string | null;
  general_notes: string | null;
  referral_notes: string | null;
  intake_notes: string | null;
  latitude: number | null;
  longitude: number | null;
  is_active: boolean;
  contact_names?: string[];
  activity_note_snippets?: string[];
};

function normalizePhoneDigits(v: string | null | undefined): string {
  return (v ?? "").replace(/\D/g, "");
}

function matchesFieldFilter(row: FacilitySearchRow, filter: FacilityFieldFilter): boolean {
  if (row.type && filter.types.includes(row.type)) return true;
  const hay = [row.name, row.type, row.general_notes, row.referral_notes]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return filter.keywords.some((kw) => hay.includes(kw));
}

function textMatches(row: FacilitySearchRow, text: string): boolean {
  if (!text) return true;
  const lower = text.toLowerCase();
  const haystack = [
    row.name,
    row.type,
    row.city,
    row.state,
    row.zip,
    row.main_phone,
    row.fax,
    row.email,
    row.website,
    row.general_notes,
    row.referral_notes,
    row.intake_notes,
    ...(row.contact_names ?? []),
    ...(row.activity_note_snippets ?? []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return haystack.includes(lower);
}

/**
 * Filter facilities using parsed smart search + optional explicit field filter chip.
 */
export function filterFacilitiesForFinder(
  rows: FacilitySearchRow[],
  parsed: ParsedFacilityFinderQuery,
  explicitFieldFilterId: FacilityFieldFilterId | null
): FacilitySearchRow[] {
  const filterId = explicitFieldFilterId ?? parsed.fieldFilterId;
  const fieldFilter = filterId ? getFieldFilterById(filterId) : null;

  return rows.filter((row) => {
    if (!row.is_active) return false;

    if (fieldFilter && !matchesFieldFilter(row, fieldFilter)) return false;

    if (parsed.city) {
      const cityLower = parsed.city.toLowerCase();
      if (!(row.city ?? "").toLowerCase().includes(cityLower)) return false;
    }

    if (parsed.phoneDigits) {
      const main = normalizePhoneDigits(row.main_phone);
      const fax = normalizePhoneDigits(row.fax);
      const needle = parsed.phoneDigits;
      const col = parsed.isFaxSearch ? fax : main || fax;
      if (!col.includes(needle) && !needle.includes(col)) {
        if (!main.includes(needle) && !fax.includes(needle)) return false;
      }
    }

    if (parsed.text && !textMatches(row, parsed.text)) return false;

    return true;
  });
}

export function facilityMatchExplanation(
  row: FacilitySearchRow,
  parsed: ParsedFacilityFinderQuery
): string | null {
  if (!parsed.text) return null;
  const lower = parsed.text.toLowerCase();
  for (const note of row.activity_note_snippets ?? []) {
    if (note.toLowerCase().includes(lower)) return `activity note — "${note.slice(0, 80)}${note.length > 80 ? "…" : ""}"`;
  }
  for (const name of row.contact_names ?? []) {
    if (name.toLowerCase().includes(lower)) return `contact — ${name}`;
  }
  if ((row.fax ?? "").toLowerCase().includes(lower)) return "fax number";
  if ((row.main_phone ?? "").toLowerCase().includes(lower)) return "phone number";
  if ((row.city ?? "").toLowerCase().includes(lower)) return "city";
  if ((row.type ?? "").toLowerCase().includes(lower)) return "specialty/type";
  if ((row.name ?? "").toLowerCase().includes(lower)) return "facility name";
  return null;
}
