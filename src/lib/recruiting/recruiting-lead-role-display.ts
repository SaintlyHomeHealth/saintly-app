/**
 * Role/license badge for recruiting lead list rows.
 */

import {
  isValidRecruitingDiscipline,
  RECRUITING_DISCIPLINE_OPTIONS,
  type RecruitingDisciplineOption,
} from "@/lib/recruiting/recruiting-options";

export type RecruitingLeadRoleBadge = RecruitingDisciplineOption;

/** Keep aligned with `RECRUITING_DISCIPLINE_OPTIONS` (forms, filters, badges). */
export const RECRUITING_LEAD_ROLE_FILTER_OPTIONS: readonly RecruitingLeadRoleBadge[] =
  RECRUITING_DISCIPLINE_OPTIONS;

export function recruitingLeadRoleBadge(input: {
  license_status?: string | null;
  lead_type?: string | null;
  form_name?: string | null;
}): RecruitingLeadRoleBadge {
  const license = input.license_status?.trim();
  if (license && isValidRecruitingDiscipline(license)) {
    return license;
  }

  const hay = [input.license_status, input.lead_type, input.form_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  if (/\brn\b|registered nurse|\bbsn\b/.test(hay)) return "RN";
  if (/\blpn\b|\blvn\b|licensed practical nurse/.test(hay)) return "LPN";
  if (/\bcna\b|certified nursing assistant/.test(hay)) return "CNA";
  if (/\bpta\b|physical therapist assistant|physical therapy assistant/.test(hay)) return "PTA";
  if (/\bphysical therapist\b(?!\s+assistant)|\bdpt\b/.test(hay)) return "PT";
  if (/\bpt\b/.test(hay)) return "PT";
  if (
    /\boccupational therapist\b(?!\s+assistant)|\boccupational therapy\b(?!\s+assistant)|\botr\/l\b|\botr\b|\botd\b|\bmot\b|\bmsot\b|\bbsot\b|\bot\b/.test(
      hay
    )
  ) {
    return "OT";
  }
  if (
    /\bspeech[- ]language pathologist\b|\bspeech therapist\b|\bspeech therapy\b|\bccc[- ]slp\b|\bslp\b/.test(
      hay
    )
  ) {
    return "ST";
  }
  if (/\bhha\b|home health aide/.test(hay)) return "HHA";
  return "Other";
}

export function isRecruitingLeadRoleBadge(value: string): value is RecruitingLeadRoleBadge {
  return (RECRUITING_LEAD_ROLE_FILTER_OPTIONS as readonly string[]).includes(value);
}

export function recruitingLeadRoleBadgeClass(role: RecruitingLeadRoleBadge): string {
  const base =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  switch (role) {
    case "RN":
      return `${base} border-sky-200 bg-sky-50 text-sky-900`;
    case "LPN":
      return `${base} border-indigo-200 bg-indigo-50 text-indigo-900`;
    case "CNA":
      return `${base} border-lime-200 bg-lime-50 text-lime-900`;
    case "PT":
      return `${base} border-cyan-200 bg-cyan-50 text-cyan-900`;
    case "PTA":
      return `${base} border-teal-200 bg-teal-50 text-teal-900`;
    case "OT":
      return `${base} border-violet-200 bg-violet-50 text-violet-900`;
    case "ST":
      return `${base} border-fuchsia-200 bg-fuchsia-50 text-fuchsia-900`;
    case "HHA":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-900`;
    default:
      return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  }
}
