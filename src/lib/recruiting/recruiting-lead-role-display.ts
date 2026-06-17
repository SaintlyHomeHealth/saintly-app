/**
 * Role/license badge for recruiting lead list rows.
 */

export type RecruitingLeadRoleBadge = "RN" | "LPN" | "PTA" | "PT" | "HHA" | "Other";

export const RECRUITING_LEAD_ROLE_FILTER_OPTIONS: readonly RecruitingLeadRoleBadge[] = [
  "RN",
  "LPN",
  "PTA",
  "PT",
  "HHA",
  "Other",
] as const;

export function recruitingLeadRoleBadge(input: {
  license_status?: string | null;
  lead_type?: string | null;
  form_name?: string | null;
}): RecruitingLeadRoleBadge {
  const hay = [input.license_status, input.lead_type, input.form_name]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  if (/\brn\b|registered nurse/.test(hay)) return "RN";
  if (/\blpn\b|licensed practical nurse/.test(hay)) return "LPN";
  if (/\bpta\b|physical therapy assistant/.test(hay)) return "PTA";
  if (/\bpt\b|physical therapist/.test(hay)) return "PT";
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
    case "PT":
      return `${base} border-cyan-200 bg-cyan-50 text-cyan-900`;
    case "PTA":
      return `${base} border-teal-200 bg-teal-50 text-teal-900`;
    case "HHA":
      return `${base} border-emerald-200 bg-emerald-50 text-emerald-900`;
    default:
      return `${base} border-slate-200 bg-slate-50 text-slate-700`;
  }
}
