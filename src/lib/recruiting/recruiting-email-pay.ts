import type { RecruitingEmailTemplateId } from "@/lib/recruiting/recruiting-email-templates";
import { recruitingLeadRoleBadge } from "@/lib/recruiting/recruiting-lead-role-display";
import type { RecruitingDisciplineOption } from "@/lib/recruiting/recruiting-options";
import type { RecruitingLeadEmailContext } from "@/lib/recruiting/render-recruiting-email-template";

export type RecruitingEmailPayDefaults = {
  visitRate: string;
  socRate: string;
  paySummary: string;
  includeSoc: boolean;
};

export function buildRnRecruitingPaySummary(socRate: string): string {
  const soc = socRate.trim() || "$110";
  return `RN regular visit pay starting at $60 per visit, with higher rates up to $80 based on experience, case complexity, and reliability. Start of Care visits are paid at ${soc}.`;
}

export function buildRecruitingPaySummary(
  visitRate: string,
  socRate: string,
  includeSoc: boolean,
  templateId?: RecruitingEmailTemplateId
): string {
  if (templateId === "rn_follow_up") {
    return buildRnRecruitingPaySummary(socRate);
  }
  const visit = visitRate.trim();
  if (!visit) return "";
  if (includeSoc && socRate.trim()) {
    return `${visit} per visit and ${socRate.trim()} for SOC`;
  }
  return `${visit} per visit`;
}

const ROLE_FOLLOW_UP_PAY: Record<
  | "rn_follow_up"
  | "pt_follow_up"
  | "pta_follow_up"
  | "lpn_follow_up"
  | "ot_follow_up"
  | "st_follow_up",
  RecruitingEmailPayDefaults
> = {
  rn_follow_up: {
    visitRate: "$60–$80",
    socRate: "$110",
    paySummary: buildRnRecruitingPaySummary("$110"),
    includeSoc: true,
  },
  pt_follow_up: {
    visitRate: "$80",
    socRate: "$110",
    paySummary: "$80 per visit and $110 for SOC",
    includeSoc: true,
  },
  pta_follow_up: {
    visitRate: "$60",
    socRate: "",
    paySummary: "$60 per visit",
    includeSoc: false,
  },
  lpn_follow_up: {
    visitRate: "$60",
    socRate: "",
    paySummary: "$60 per visit",
    includeSoc: false,
  },
  ot_follow_up: {
    visitRate: "$80",
    socRate: "",
    paySummary: "$80 per visit",
    includeSoc: false,
  },
  st_follow_up: {
    visitRate: "$80",
    socRate: "",
    paySummary: "$80 per visit",
    includeSoc: false,
  },
};

/** Default follow-up template per shared recruiting discipline. */
export const RECRUITING_DISCIPLINE_DEFAULT_EMAIL_TEMPLATE: Record<
  RecruitingDisciplineOption,
  RecruitingEmailTemplateId
> = {
  RN: "rn_follow_up",
  LPN: "lpn_follow_up",
  PT: "pt_follow_up",
  PTA: "pta_follow_up",
  OT: "ot_follow_up",
  ST: "st_follow_up",
  CNA: "interview_scheduling",
  HHA: "interview_scheduling",
  Other: "interview_scheduling",
};

export function recruitingEmailTemplateUsesPayFields(
  templateId: RecruitingEmailTemplateId
): boolean {
  return templateId in ROLE_FOLLOW_UP_PAY;
}

export function getRecruitingEmailPayDefaultsForTemplate(
  templateId: RecruitingEmailTemplateId
): RecruitingEmailPayDefaults | null {
  if (templateId in ROLE_FOLLOW_UP_PAY) {
    return { ...ROLE_FOLLOW_UP_PAY[templateId as keyof typeof ROLE_FOLLOW_UP_PAY] };
  }
  return null;
}

export function inferRecruitingEmailPayDefaultsForRole(role: string): RecruitingEmailPayDefaults {
  const discipline = recruitingLeadRoleBadge({ license_status: role });
  const templateId = RECRUITING_DISCIPLINE_DEFAULT_EMAIL_TEMPLATE[discipline];
  if (templateId in ROLE_FOLLOW_UP_PAY) {
    return { ...ROLE_FOLLOW_UP_PAY[templateId as keyof typeof ROLE_FOLLOW_UP_PAY] };
  }
  return { visitRate: "", socRate: "", paySummary: "", includeSoc: false };
}

export function inferRecruitingEmailTemplateIdForLead(
  lead: RecruitingLeadEmailContext
): RecruitingEmailTemplateId {
  const discipline = recruitingLeadRoleBadge(lead);
  return RECRUITING_DISCIPLINE_DEFAULT_EMAIL_TEMPLATE[discipline];
}
