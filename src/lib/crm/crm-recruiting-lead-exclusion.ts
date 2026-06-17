/**
 * Detect and exclude recruiting/applicant rows from patient CRM → Leads.
 */

const RECRUITING_TEXT_NEEDLES = [
  "employment",
  "careers",
  "career",
  "hiring",
  "applicant",
  "nurse",
  "lpn",
  "rn",
  "pta",
  "resume",
  "job",
  "therapist",
  "aide",
  "home health experience",
  "visits per week",
  "coverage area",
  "licensed",
] as const;

function norm(value: string | null | undefined): string {
  return String(value ?? "").trim().toLowerCase();
}

function textLooksRecruiting(value: string | null | undefined): boolean {
  const hay = norm(value);
  if (!hay) return false;
  return RECRUITING_TEXT_NEEDLES.some((needle) => hay.includes(needle));
}

export function isCrmRecruitingApplicantLead(lead: {
  lead_type?: string | null;
  source?: string | null;
  notes?: string | null;
  external_source_metadata?: unknown;
}): boolean {
  const leadType = norm(lead.lead_type);
  if (leadType === "employee" || leadType === "recruiting") {
    return true;
  }

  const meta = lead.external_source_metadata;
  if (meta && typeof meta === "object") {
    const root = meta as Record<string, unknown>;
    if (root.employment_application && typeof root.employment_application === "object") {
      return true;
    }
    if (norm(String(root.pipeline ?? "")) === "recruiting") {
      return true;
    }
    if (root.migrated_to_recruiting === true) {
      return true;
    }
  }

  if (textLooksRecruiting(lead.source)) return true;
  if (textLooksRecruiting(lead.notes)) return true;
  return false;
}

type LeadListFilterQB = {
  or(expr: string): LeadListFilterQB;
  is(column: string, value: unknown): LeadListFilterQB;
  not(column: string, operator: string, value: unknown): LeadListFilterQB;
  filter(column: string, operator: string, value: unknown): LeadListFilterQB;
};

/**
 * Apply patient CRM exclusions for recruiting/applicant leads.
 */
export function attachExcludeRecruitingCrmLeadsPredicates(qb: unknown): unknown {
  let q = qb as LeadListFilterQB;

  q = q.or("lead_type.is.null,lead_type.neq.employee");
  q = q.is("external_source_metadata->employment_application", null);
  q = q.or(
    "external_source_metadata.is.null,external_source_metadata->>pipeline.is.null,external_source_metadata->>pipeline.neq.recruiting"
  );
  q = q.or(
    "external_source_metadata.is.null,external_source_metadata->>migrated_to_recruiting.is.null,external_source_metadata->>migrated_to_recruiting.neq.true"
  );

  for (const needle of ["employment", "careers", "hiring", "applicant", "resume"]) {
    q = q.not("source", "ilike", `%${needle}%`);
  }

  return q;
}
