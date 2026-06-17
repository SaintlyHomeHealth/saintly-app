import type { RecruitingEmailTemplateId } from "@/lib/recruiting/recruiting-email-templates";

export type RecruitingEmailPayDefaults = {
  visitRate: string;
  socRate: string;
  paySummary: string;
  includeSoc: boolean;
};

export function buildRecruitingPaySummary(
  visitRate: string,
  socRate: string,
  includeSoc: boolean
): string {
  const visit = visitRate.trim();
  if (!visit) return "";
  if (includeSoc && socRate.trim()) {
    return `${visit} per visit and ${socRate.trim()} for SOC`;
  }
  return `${visit} per visit`;
}

const ROLE_FOLLOW_UP_PAY: Record<
  "rn_follow_up" | "pt_follow_up" | "pta_follow_up" | "lpn_follow_up",
  RecruitingEmailPayDefaults
> = {
  rn_follow_up: {
    visitRate: "$60–$80",
    socRate: "$110",
    paySummary: "$60–$80 per visit and $110 for SOC",
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
};

export function recruitingEmailTemplateUsesPayFields(
  templateId: RecruitingEmailTemplateId
): boolean {
  return (
    templateId === "rn_follow_up" ||
    templateId === "pt_follow_up" ||
    templateId === "pta_follow_up" ||
    templateId === "lpn_follow_up"
  );
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
  const r = role.trim().toLowerCase();
  if (r === "rn" || /\bregistered nurse\b/.test(r)) {
    return { ...ROLE_FOLLOW_UP_PAY.rn_follow_up };
  }
  if (r === "pta" || /\bphysical therapy assistant\b/.test(r)) {
    return { ...ROLE_FOLLOW_UP_PAY.pta_follow_up };
  }
  if (r === "pt" || /\bphysical therapist\b/.test(r)) {
    return { ...ROLE_FOLLOW_UP_PAY.pt_follow_up };
  }
  if (r === "lpn" || /\blicensed practical nurse\b/.test(r)) {
    return { ...ROLE_FOLLOW_UP_PAY.lpn_follow_up };
  }
  return { ...ROLE_FOLLOW_UP_PAY.lpn_follow_up };
}
