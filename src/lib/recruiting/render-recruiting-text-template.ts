import { extractRecruitingLeadFirstName } from "@/lib/recruiting/facebook-recruiting-lead-shared";

export type RecruitingTextContext = {
  full_name: string;
  first_name?: string | null;
  phone?: string | null;
  city?: string | null;
  coverage_area?: string | null;
  discipline?: string | null;
};

const VARIABLE_RE = /\{\{\s*([a-z_]+)\s*\}\}/gi;

export const RECRUITING_GENERAL_DISCIPLINE_OUTREACH_TEMPLATE_ID = "general_discipline_outreach";

/** Template with {{discipline}} when a known discipline is on file. */
export const RECRUITING_GENERAL_DISCIPLINE_OUTREACH_WITH_DISCIPLINE_BODY =
  "Hi {{first_name}}, my name is Paul Vonasek and I am with Saintly Home Health. I was reaching out to see if you can see some of our patients for {{discipline}}. Please give me a call or shoot me a text when free. Thank you.";

/** Fallback when discipline is missing or Other. */
export const RECRUITING_GENERAL_DISCIPLINE_OUTREACH_NO_DISCIPLINE_BODY =
  "Hi {{first_name}}, my name is Paul Vonasek and I am with Saintly Home Health. I was reaching out to see if you are available to see some of our patients. Please give me a call or shoot me a text when free. Thank you.";

function resolveFirstName(ctx: RecruitingTextContext): string {
  const explicit = ctx.first_name?.trim();
  if (explicit) return explicit;
  return extractRecruitingLeadFirstName(ctx.full_name) || "there";
}

const KNOWN_RECRUITING_DISCIPLINES = ["RN", "LPN", "CNA", "PT", "PTA", "OT", "ST", "HHA"] as const;

function resolveDisciplineLabel(raw: string | null | undefined): string | null {
  const d = (raw ?? "").trim();
  if (!d) return null;
  const upper = d.toUpperCase();
  if (upper === "OTHER") return null;
  if ((KNOWN_RECRUITING_DISCIPLINES as readonly string[]).includes(d)) {
    return d;
  }
  // Preserve stored value when it is a recognizable abbreviation (e.g. legacy rows).
  return d;
}

export function buildRecruitingTextVariables(ctx: RecruitingTextContext): Record<string, string> {
  const full_name = ctx.full_name?.trim() || "there";
  const discipline = resolveDisciplineLabel(ctx.discipline);
  const coverageFromField = ctx.coverage_area?.trim() || "";
  const coverageFromCity = [ctx.city?.trim()].filter(Boolean).join(", ");

  return {
    first_name: resolveFirstName(ctx),
    full_name,
    discipline: discipline ?? "",
    phone: ctx.phone?.trim() || "",
    city: ctx.city?.trim() || "",
    coverage_area: coverageFromField || coverageFromCity,
  };
}

export function renderRecruitingTextTemplate(template: string, variables: Record<string, string>): string {
  return template.replace(VARIABLE_RE, (_match, key: string) => {
    const k = key.trim().toLowerCase();
    return variables[k] ?? "";
  });
}

/** Pick the general outreach template and render with candidate variables. */
export function buildGeneralDisciplineOutreachText(ctx: RecruitingTextContext): string {
  const variables = buildRecruitingTextVariables(ctx);
  const discipline = resolveDisciplineLabel(ctx.discipline);
  const template = discipline
    ? RECRUITING_GENERAL_DISCIPLINE_OUTREACH_WITH_DISCIPLINE_BODY
    : RECRUITING_GENERAL_DISCIPLINE_OUTREACH_NO_DISCIPLINE_BODY;
  return renderRecruitingTextTemplate(template, variables);
}
