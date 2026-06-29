import { escapeForIlike, searchQueryDigits } from "@/lib/crm/crm-leads-search";

/** Cap UUID buckets embedded in `.or(...)` so filter strings stay within practical URI limits. */
export const ADMIN_RECRUITING_LEADS_KEYWORD_ID_BUCKET_CAP = 120;

const RECRUITING_LEAD_KEYWORD_ILIKE_COLUMNS = [
  "full_name",
  "phone",
  "email",
  "normalized_phone",
  "normalized_email",
  "city",
  "coverage_area",
  "license_status",
  "lead_type",
  "source",
  "form_name",
  "notes",
  "start_date",
  "home_health_experience",
  "visits_per_week",
  "contact_preference",
] as const;

/** Full JSON text search for Indeed / Zapier / Facebook custom answers in raw_payload. */
const RECRUITING_LEAD_KEYWORD_JSON_TEXT_COLUMNS = ["raw_payload::text"] as const;

const RECRUITING_CANDIDATE_KEYWORD_ILIKE_COLUMNS = [
  "full_name",
  "first_name",
  "last_name",
  "phone",
  "email",
  "city",
  "state",
  "zip",
  "coverage_area",
  "discipline",
  "source",
  "notes",
] as const;

export function escapedRecruitingLeadSearchTerms(qRaw: string): string[] {
  const q = qRaw.trim().slice(0, 120);
  if (!q) return [];
  const esc = escapeForIlike(q);
  return esc ? [esc] : [];
}

function buildIlikeOrParts(columns: readonly string[], escapedTerms: readonly string[]): string[] {
  const parts: string[] = [];
  const seen = new Set<string>();
  for (const col of columns) {
    for (const esc of escapedTerms) {
      const frag = `${col}.ilike.%${esc}%`;
      if (seen.has(frag)) continue;
      seen.add(frag);
      parts.push(frag);
    }
  }
  return parts;
}

function buildPhoneIlikeOrParts(qRaw: string, phoneColumns: readonly string[]): string[] {
  const d = searchQueryDigits(qRaw);
  if (d.length < 7) return [];

  const parts: string[] = [];
  const seen = new Set<string>();
  const needles = [d];
  if (d.length >= 10) needles.push(d.slice(-10));
  if (d.length === 10) needles.push(`1${d}`);
  if (d.length === 11 && d.startsWith("1")) needles.push(d.slice(1));

  for (const col of phoneColumns) {
    for (const needle of needles) {
      const frag = `${col}.ilike.%${needle}%`;
      if (seen.has(frag)) continue;
      seen.add(frag);
      parts.push(frag);
    }
  }
  return parts;
}

export function buildRecruitingCandidateKeywordOrClause(
  escapedTerms: readonly string[],
  qRaw: string
): string | null {
  const parts = [
    ...buildIlikeOrParts(RECRUITING_CANDIDATE_KEYWORD_ILIKE_COLUMNS, escapedTerms),
    ...buildPhoneIlikeOrParts(qRaw, ["phone"]),
  ];
  return parts.length > 0 ? parts.join(",") : null;
}

/**
 * Builds the inner expression passed to `.or(...)` on `facebook_recruiting_leads` when URL `q` is non-empty.
 */
export function buildRecruitingLeadKeywordSearchOrClause(input: {
  escapedTerms: readonly string[];
  qRaw: string;
  linkedLeadIds: readonly string[];
}): string | null {
  const parts = [
    ...buildIlikeOrParts(RECRUITING_LEAD_KEYWORD_ILIKE_COLUMNS, input.escapedTerms),
    ...buildIlikeOrParts(RECRUITING_LEAD_KEYWORD_JSON_TEXT_COLUMNS, input.escapedTerms),
    ...buildPhoneIlikeOrParts(input.qRaw, ["phone", "normalized_phone"]),
  ];

  if (input.linkedLeadIds.length > 0) {
    parts.push(`id.in.(${input.linkedLeadIds.join(",")})`);
  }

  return parts.length > 0 ? parts.join(",") : null;
}
